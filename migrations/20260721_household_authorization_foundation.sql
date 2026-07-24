begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mi hogar',
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.households enable row level security;

alter table public.household_members
  add column if not exists household_id uuid references public.households(id) on delete cascade,
  add column if not exists auth_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists role text not null default 'member';

alter table public.household_members
  drop constraint if exists household_members_role_check;
alter table public.household_members
  add constraint household_members_role_check
  check (role in ('owner', 'member', 'viewer'));

create unique index if not exists household_members_auth_user_unique
  on public.household_members(auth_user_id)
  where auth_user_id is not null;
create index if not exists household_members_household_user_idx
  on public.household_members(household_id, auth_user_id)
  where active is not false;

-- Existing authenticated users are isolated by default. Joining two users to the
-- same household remains an explicit administrative operation.
insert into public.households (name, created_by)
select 'Mi hogar', users.id
from auth.users users
where not exists (
  select 1
  from public.household_members member
  where member.auth_user_id = users.id
)
and not exists (
  select 1
  from public.households household
  where household.created_by = users.id
);

insert into public.household_members (name, household_id, auth_user_id, role, active)
select coalesce(users.email, 'Miembro del hogar'), household.id, users.id, 'owner', true
from auth.users users
join public.households household on household.created_by = users.id
where not exists (
  select 1
  from public.household_members member
  where member.auth_user_id = users.id
);

-- Preserve historical text-only household people. They can be attached safely
-- only when the installation has a single household.
do $$
declare
  household_count integer;
  sole_household_id uuid;
begin
  select count(*), min(id::text)::uuid into household_count, sole_household_id
  from public.households;

  if exists (
    select 1 from public.household_members where household_id is null
  ) and household_count <> 1 then
    raise exception 'RLS hardening stopped: historical household_members are ambiguous across % households', household_count;
  end if;

  if household_count = 1 then
    update public.household_members
    set household_id = sole_household_id
    where household_id is null;
  end if;
end
$$;

alter table public.household_members alter column household_id set not null;

create or replace function private.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.household_members member
    where member.household_id = target_household_id
      and member.auth_user_id = (select auth.uid())
      and member.active is not false
  );
$$;

create or replace function private.household_for_user(target_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select member.household_id
  from public.household_members member
  where member.auth_user_id = target_user_id
    and member.active is not false
    and ((select auth.uid()) is null or target_user_id = (select auth.uid()))
  limit 1;
$$;

create or replace function private.can_write_household(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.household_members member
    where member.household_id = target_household_id
      and member.auth_user_id = (select auth.uid())
      and member.role in ('owner', 'member')
      and member.active is not false
  );
$$;

revoke all on function private.is_household_member(uuid) from public, anon;
revoke all on function private.household_for_user(uuid) from public, anon;
revoke all on function private.can_write_household(uuid) from public, anon;
grant execute on function private.is_household_member(uuid) to authenticated, service_role;
grant execute on function private.household_for_user(uuid) to authenticated, service_role;
grant execute on function private.can_write_household(uuid) to authenticated, service_role;

create or replace function private.enforce_household_scope()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  acting_user_id uuid := (select auth.uid());
  lineage_user_id uuid;
  resolved_household_id uuid;
  old_payload jsonb;
  new_payload jsonb;
begin
  new_payload := to_jsonb(new);
  lineage_user_id := nullif(new_payload ->> 'user_id', '')::uuid;

  if tg_op = 'UPDATE' then
    old_payload := to_jsonb(old);
    if new.household_id is distinct from old.household_id then
      raise exception 'household_id cannot be reassigned';
    end if;
    if old_payload ? 'user_id'
       and (new_payload ->> 'user_id') is distinct from (old_payload ->> 'user_id') then
      raise exception 'user_id lineage cannot be reassigned';
    end if;
    return new;
  end if;

  if new.household_id is null then
    resolved_household_id := private.household_for_user(coalesce(acting_user_id, lineage_user_id));
    if resolved_household_id is null then
      raise exception 'household_id is required and could not be derived';
    end if;
    new.household_id := resolved_household_id;
  end if;

  if acting_user_id is not null then
    if not private.is_household_member(new.household_id) then
      raise exception 'authenticated user is not a member of household %', new.household_id;
    end if;
    if lineage_user_id is not null and lineage_user_id <> acting_user_id then
      raise exception 'user_id must match the authenticated creator';
    end if;
  elsif lineage_user_id is not null
        and private.household_for_user(lineage_user_id) is distinct from new.household_id then
    raise exception 'user_id lineage does not belong to household %', new.household_id;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_household_scope() from public, anon, authenticated;

do $$
declare
  target_table text;
  household_count integer;
  sole_household_id uuid;
  unresolved_count bigint;
  has_user_id boolean;
  constraint_name text;
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
  select count(*), min(id::text)::uuid into household_count, sole_household_id
  from public.households;

  foreach target_table in array scoped_tables loop
    if to_regclass(format('public.%I', target_table)) is null then
      raise exception 'RLS hardening expected table public.% but it does not exist', target_table;
    end if;

    execute format('alter table public.%I add column if not exists household_id uuid', target_table);

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and information_schema.columns.table_name = target_table
        and column_name = 'user_id'
    ) into has_user_id;

    if has_user_id then
      execute format(
        'update public.%1$I row set household_id = member.household_id from public.household_members member where row.household_id is null and row.user_id = member.auth_user_id and member.active is not false',
        target_table
      );
    end if;

    if household_count = 1 then
      execute format('update public.%I set household_id = $1 where household_id is null', target_table)
      using sole_household_id;
    end if;

    execute format('select count(*) from public.%I where household_id is null', target_table)
    into unresolved_count;
    if unresolved_count > 0 then
      raise exception 'RLS hardening stopped: public.% has % rows without an unambiguous household', target_table, unresolved_count;
    end if;

    constraint_name := left(target_table || '_household_id_fkey', 63);
    if not exists (
      select 1
      from pg_constraint
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
    execute format('create index if not exists %I on public.%I(household_id)', left(target_table || '_household_id_idx', 63), target_table);
    execute format('drop trigger if exists enforce_household_scope on public.%I', target_table);
    execute format(
      'create trigger enforce_household_scope before insert or update on public.%I for each row execute function private.enforce_household_scope()',
      target_table
    );
  end loop;
end
$$;

commit;
