begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

revoke all on table public.households from anon;
revoke all on table public.household_members from anon;
grant select, update on table public.households to authenticated;
grant select on table public.household_members to authenticated;

drop policy if exists households_household_select on public.households;
drop policy if exists households_household_update on public.households;
create policy households_household_select
  on public.households for select to authenticated
  using ((select private.is_household_member(id)));
create policy households_household_update
  on public.households for update to authenticated
  using ((select private.can_write_household(id)))
  with check ((select private.can_write_household(id)));

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'household_members'
  loop
    execute format('drop policy %I on public.household_members', existing_policy.policyname);
  end loop;
end
$$;

create policy household_members_household_select
  on public.household_members for select to authenticated
  using ((select private.is_household_member(household_id)));

do $$
declare
  target_table text;
  existing_policy record;
  scoped_tables constant text[] := array[
    'accounts',
    'asset_maintenance',
    'assets',
    'ath_movil_emails',
    'ath_movil_messages',
    'confirmed_ledger_duplicate_resolutions',
    'credit_cards',
    'financial_goals',
    'financial_links',
    'funds',
    'future_obligations',
    'goals',
    'income_schedule',
    'liabilities',
    'merchant_rules',
    'obligation_instances',
    'obligation_payment_links',
    'obligation_providers',
    'obligation_reconciliation_events',
    'obligations',
    'payment_instances',
    'people',
    'plaid_accounts',
    'plaid_connections',
    'plaid_imports',
    'plaid_sync_runs',
    'planning_item_transactions',
    'planning_items',
    'priorities',
    'quick_entries',
    'review_queue_resolution_events',
    'scheduled_payments',
    'transaction_enrichments',
    'transaction_review_items',
    'transaction_rules',
    'transaction_suggestions'
  ];
begin
  foreach target_table in array scoped_tables loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all on table public.%I from anon', target_table);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', target_table);

    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy %I on public.%I', existing_policy.policyname, target_table);
    end loop;

    execute format(
      'create policy %1$I on public.%2$I for select to authenticated using ((select private.is_household_member(household_id)))',
      left(target_table || '_household_select', 63),
      target_table
    );
    execute format(
      'create policy %1$I on public.%2$I for insert to authenticated with check ((select private.can_write_household(household_id)))',
      left(target_table || '_household_insert', 63),
      target_table
    );
    execute format(
      'create policy %1$I on public.%2$I for update to authenticated using ((select private.can_write_household(household_id))) with check ((select private.can_write_household(household_id)))',
      left(target_table || '_household_update', 63),
      target_table
    );
    execute format(
      'create policy %1$I on public.%2$I for delete to authenticated using ((select private.can_write_household(household_id)))',
      left(target_table || '_household_delete', 63),
      target_table
    );
  end loop;
end
$$;

-- Release gate: no policy in public may bypass row isolation with a literal true.
do $$
declare
  unsafe_policy_count integer;
begin
  select count(*) into unsafe_policy_count
  from pg_policies
  where schemaname = 'public'
    and (trim(coalesce(qual, '')) = 'true' or trim(coalesce(with_check, '')) = 'true');

  if unsafe_policy_count > 0 then
    raise exception 'RLS hardening stopped: % public policies still use literal true', unsafe_policy_count;
  end if;
end
$$;

commit;
