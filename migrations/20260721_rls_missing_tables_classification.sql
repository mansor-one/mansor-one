begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

-- Classification:
-- household-scoped: account_snapshots, ath_movil_matches, events,
-- fixed_expenses, monthly_documents, raw_transactions, reminders,
-- statement_imports, transactions, variable_income.
-- user-scoped: pablo_questions.
-- server-only/internal: ath_movil_rules, categories, plaid_category_rules,
-- plaid_items, recommendations.

do $$
declare
  target_table text;
  household_count integer;
  sole_household_id uuid;
  unresolved_count bigint;
  constraint_name text;
  household_tables constant text[] := array[
    'account_snapshots',
    'ath_movil_matches',
    'events',
    'fixed_expenses',
    'monthly_documents',
    'raw_transactions',
    'reminders',
    'statement_imports',
    'transactions',
    'variable_income'
  ];
begin
  if to_regprocedure('private.is_household_member(uuid)') is null
     or to_regprocedure('private.can_write_household(uuid)') is null
     or to_regprocedure('private.enforce_household_scope()') is null then
    raise exception 'Apply the household authorization foundation before this migration';
  end if;

  select count(*), min(id) into household_count, sole_household_id
  from public.households;

  foreach target_table in array household_tables loop
    if to_regclass(format('public.%I', target_table)) is null then
      raise exception 'Expected table public.% does not exist', target_table;
    end if;
    execute format('alter table public.%I add column if not exists household_id uuid', target_table);
  end loop;

  if exists (
    select 1
    from public.account_snapshots snapshot
    join public.accounts account on account.id = snapshot.account_id
    join public.credit_cards card on card.id = snapshot.credit_card_id
    where account.household_id <> card.household_id
  ) then
    raise exception 'RLS backfill conflict: account_snapshots references parents from different households';
  end if;

  if exists (
    select 1
    from public.transactions transaction_row
    left join public.accounts account on account.id = transaction_row.account_id
    left join public.credit_cards card on card.id = transaction_row.credit_card_id
    left join public.people person on person.id = transaction_row.person_id
    where (account.household_id is not null and card.household_id is not null and account.household_id <> card.household_id)
       or (account.household_id is not null and person.household_id is not null and account.household_id <> person.household_id)
       or (card.household_id is not null and person.household_id is not null and card.household_id <> person.household_id)
  ) then
    raise exception 'RLS backfill conflict: transactions references parents from different households';
  end if;

  if exists (
    select 1
    from public.raw_transactions raw
    left join public.statement_imports statement on statement.id = raw.statement_import_id
    left join public.accounts account on account.id = raw.account_id
    left join public.credit_cards card on card.id = raw.credit_card_id
    where (statement.household_id is not null and account.household_id is not null and statement.household_id <> account.household_id)
       or (statement.household_id is not null and card.household_id is not null and statement.household_id <> card.household_id)
       or (account.household_id is not null and card.household_id is not null and account.household_id <> card.household_id)
  ) then
    raise exception 'RLS backfill conflict: raw_transactions references parents from different households';
  end if;

  -- Prefer authoritative parent relationships before the conservative singleton fallback.
  update public.account_snapshots target_snapshot
  set household_id = coalesce(account.household_id, card.household_id)
  from public.account_snapshots source
  left join public.accounts account on account.id = source.account_id
  left join public.credit_cards card on card.id = source.credit_card_id
  where target_snapshot.id = source.id and target_snapshot.household_id is null;

  update public.transactions target_transaction
  set household_id = coalesce(account.household_id, card.household_id, person.household_id)
  from public.transactions source
  left join public.accounts account on account.id = source.account_id
  left join public.credit_cards card on card.id = source.credit_card_id
  left join public.people person on person.id = source.person_id
  where target_transaction.id = source.id and target_transaction.household_id is null;

  update public.statement_imports target_statement
  set household_id = raw.household_id
  from public.raw_transactions raw
  where raw.statement_import_id = target_statement.id
    and target_statement.household_id is null
    and raw.household_id is not null;

  update public.raw_transactions target_raw
  set household_id = coalesce(statement.household_id, account.household_id, card.household_id)
  from public.raw_transactions source
  left join public.statement_imports statement on statement.id = source.statement_import_id
  left join public.accounts account on account.id = source.account_id
  left join public.credit_cards card on card.id = source.credit_card_id
  where target_raw.id = source.id and target_raw.household_id is null;

  if exists (
    select statement_import_id
    from public.raw_transactions
    where statement_import_id is not null and household_id is not null
    group by statement_import_id
    having count(distinct household_id) > 1
  ) then
    raise exception 'RLS backfill conflict: statement_imports contains transactions from different households';
  end if;

  -- A statement may become resolvable only after its transactions inherit an
  -- account/card household. Run the parent-child pass once more.
  update public.statement_imports target_statement
  set household_id = raw.household_id
  from public.raw_transactions raw
  where raw.statement_import_id = target_statement.id
    and target_statement.household_id is null
    and raw.household_id is not null;

  update public.raw_transactions target_raw
  set household_id = statement.household_id
  from public.statement_imports statement
  where target_raw.statement_import_id = statement.id
    and target_raw.household_id is null
    and statement.household_id is not null;

  update public.ath_movil_matches target_match
  set household_id = coalesce(email.household_id, transaction_row.household_id)
  from public.ath_movil_matches source
  left join public.ath_movil_emails email on email.id = source.ath_email_id
  left join public.transactions transaction_row on transaction_row.id = source.transaction_id
  where target_match.id = source.id and target_match.household_id is null;

  if exists (
    select 1
    from public.ath_movil_matches target_match
    join public.ath_movil_emails email on email.id = target_match.ath_email_id
    join public.transactions transaction_row on transaction_row.id = target_match.transaction_id
    where email.household_id <> transaction_row.household_id
  ) then
    raise exception 'RLS backfill conflict: ath_movil_matches references different households';
  end if;

  update public.events target_event
  set household_id = person.household_id
  from public.people person
  where target_event.related_person_id = person.id and target_event.household_id is null;

  update public.fixed_expenses target_expense
  set household_id = person.household_id
  from public.people person
  where target_expense.responsible_id = person.id and target_expense.household_id is null;

  if household_count = 1 then
    foreach target_table in array household_tables loop
      execute format('update public.%I set household_id = $1 where household_id is null', target_table)
      using sole_household_id;
    end loop;
  end if;

  foreach target_table in array household_tables loop
    execute format('select count(*) from public.%I where household_id is null', target_table)
    into unresolved_count;
    if unresolved_count > 0 then
      raise exception 'RLS missing-tables migration stopped: public.% has % rows without an unambiguous household', target_table, unresolved_count;
    end if;

    constraint_name := left(target_table || '_household_id_fkey', 63);
    if not exists (
      select 1 from pg_constraint
      where conname = constraint_name
        and conrelid = format('public.%I', target_table)::regclass
    ) then
      execute format(
        'alter table public.%1$I add constraint %2$I foreign key (household_id) references public.households(id) on delete restrict',
        target_table,
        constraint_name
      );
    end if;

    execute format('alter table public.%I alter column household_id set not null', target_table);
    execute format(
      'create index if not exists %I on public.%I(household_id)',
      left(target_table || '_household_id_idx', 63),
      target_table
    );
    execute format('drop trigger if exists enforce_household_scope on public.%I', target_table);
    execute format(
      'create trigger enforce_household_scope before insert or update on public.%I for each row execute function private.enforce_household_scope()',
      target_table
    );
  end loop;
end
$$;

create or replace function private.enforce_user_scope()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  acting_user_id uuid := (select auth.uid());
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'user_id lineage cannot be reassigned';
  end if;
  if acting_user_id is not null and new.user_id <> acting_user_id then
    raise exception 'user_id must match the authenticated user';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_user_scope() from public, anon, authenticated;

drop trigger if exists enforce_user_scope on public.pablo_questions;
create trigger enforce_user_scope
before insert or update on public.pablo_questions
for each row execute function private.enforce_user_scope();

do $$
declare
  target_table text;
  existing_policy record;
  household_tables constant text[] := array[
    'account_snapshots',
    'ath_movil_matches',
    'events',
    'fixed_expenses',
    'monthly_documents',
    'raw_transactions',
    'reminders',
    'statement_imports',
    'transactions',
    'variable_income'
  ];
begin
  foreach target_table in array household_tables loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all on table public.%I from anon', target_table);
    execute format('revoke all on table public.%I from authenticated', target_table);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', target_table);

    for existing_policy in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy %I on public.%I', existing_policy.policyname, target_table);
    end loop;

    execute format(
      'create policy %1$I on public.%2$I for select to authenticated using ((select private.is_household_member(household_id)))',
      left(target_table || '_household_select', 63), target_table
    );
    execute format(
      'create policy %1$I on public.%2$I for insert to authenticated with check ((select private.can_write_household(household_id)))',
      left(target_table || '_household_insert', 63), target_table
    );
    execute format(
      'create policy %1$I on public.%2$I for update to authenticated using ((select private.can_write_household(household_id))) with check ((select private.can_write_household(household_id)))',
      left(target_table || '_household_update', 63), target_table
    );
    execute format(
      'create policy %1$I on public.%2$I for delete to authenticated using ((select private.can_write_household(household_id)))',
      left(target_table || '_household_delete', 63), target_table
    );
  end loop;
end
$$;

alter table public.pablo_questions enable row level security;
revoke all on table public.pablo_questions from anon;
revoke all on table public.pablo_questions from authenticated;
grant select, insert, update, delete on table public.pablo_questions to authenticated;

drop policy if exists pablo_questions_user_select on public.pablo_questions;
drop policy if exists pablo_questions_user_insert on public.pablo_questions;
drop policy if exists pablo_questions_user_update on public.pablo_questions;
drop policy if exists pablo_questions_user_delete on public.pablo_questions;
create policy pablo_questions_user_select on public.pablo_questions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy pablo_questions_user_insert on public.pablo_questions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy pablo_questions_user_update on public.pablo_questions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy pablo_questions_user_delete on public.pablo_questions
  for delete to authenticated using ((select auth.uid()) = user_id);

do $$
declare
  target_table text;
  existing_policy record;
  server_only_tables constant text[] := array[
    'ath_movil_rules',
    'categories',
    'plaid_category_rules',
    'plaid_items',
    'recommendations'
  ];
begin
  foreach target_table in array server_only_tables loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all on table public.%I from anon', target_table);
    execute format('revoke all on table public.%I from authenticated', target_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', target_table);

    for existing_policy in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy %I on public.%I', existing_policy.policyname, target_table);
    end loop;

    -- This is not a client policy. It documents the service-only boundary and
    -- satisfies the Advisor without weakening RLS. service_role bypasses RLS.
    execute format(
      'create policy %1$I on public.%2$I for all to service_role using (false) with check (false)',
      left(target_table || '_server_only', 63), target_table
    );
  end loop;
end
$$;

-- Release gates.
do $$
declare
  missing_external_policy_count integer;
  unsafe_policy_count integer;
  unexpected_no_policy_count integer;
  client_server_only_grant_count integer;
  externally_used_tables constant text[] := array[
    'account_snapshots', 'ath_movil_matches', 'events', 'fixed_expenses',
    'monthly_documents', 'pablo_questions', 'raw_transactions', 'reminders',
    'statement_imports', 'transactions', 'variable_income'
  ];
begin
  select count(*) into missing_external_policy_count
  from unnest(externally_used_tables) target(table_name)
  where not exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'public' and policy.tablename = target.table_name
  );
  if missing_external_policy_count > 0 then
    raise exception 'RLS release gate: % externally used tables have no policies', missing_external_policy_count;
  end if;

  select count(*) into unsafe_policy_count
  from pg_policies
  where schemaname = 'public'
    and (trim(coalesce(qual, '')) = 'true' or trim(coalesce(with_check, '')) = 'true');
  if unsafe_policy_count > 0 then
    raise exception 'RLS release gate: % public policies still use literal true', unsafe_policy_count;
  end if;

  select count(*) into unexpected_no_policy_count
  from pg_class table_class
  join pg_namespace namespace on namespace.oid = table_class.relnamespace
  where namespace.nspname = 'public'
    and table_class.relkind = 'r'
    and table_class.relrowsecurity
    and not exists (
      select 1 from pg_policies policy
      where policy.schemaname = namespace.nspname and policy.tablename = table_class.relname
    );
  if unexpected_no_policy_count > 0 then
    raise exception 'RLS release gate: % public RLS tables still have no policy classification', unexpected_no_policy_count;
  end if;

  select count(*) into client_server_only_grant_count
  from information_schema.role_table_grants grant_row
  where grant_row.table_schema = 'public'
    and grant_row.table_name = any(array['ath_movil_rules','categories','plaid_category_rules','plaid_items','recommendations'])
    and grant_row.grantee in ('anon', 'authenticated')
    and grant_row.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
  if client_server_only_grant_count > 0 then
    raise exception 'RLS release gate: server-only tables retain % client data grants', client_server_only_grant_count;
  end if;
end
$$;

commit;
