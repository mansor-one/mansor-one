-- Migration: owner-safe income planning foundation
-- Formalizes expected income metadata while preserving existing rows.

alter table public.income_schedule
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists income_type text not null default 'one_time',
  add column if not exists category_code text null,
  add column if not exists amount_is_estimated boolean not null default false,
  add column if not exists confidence text not null default 'confirmed',
  add column if not exists owner_scope text not null default 'household',
  add column if not exists destination_account_id uuid null,
  add column if not exists destination_account_source text null,
  add column if not exists cadence text not null default 'one_time',
  add column if not exists status text not null default 'expected',
  add column if not exists received_at timestamptz null,
  add column if not exists notes text null;

with auth_user_count as (
  select count(*) as value
  from auth.users
),
only_user as (
  select auth.users.id
  from auth.users
  cross join auth_user_count
  where auth_user_count.value = 1
  order by auth.users.id
  limit 1
)
update public.income_schedule
set user_id = only_user.id
from only_user
where public.income_schedule.user_id is null;

update public.income_schedule
set category_code = 'income_deposit'
where category_code is null;

update public.income_schedule
set confidence = case lower(coalesce(confidence, 'confirmed'))
  when 'probable' then 'likely'
  when 'possible' then 'estimated'
  when 'estimated' then 'estimated'
  when 'likely' then 'likely'
  when 'confirmed' then 'confirmed'
  else 'confirmed'
end;

update public.income_schedule
set status = case
  when is_active = false then 'cancelled'
  when received_at is not null then 'received'
  else status
end;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.income_schedule'::regclass
      and conname = 'income_schedule_income_type_check'
  ) then
    alter table public.income_schedule
      add constraint income_schedule_income_type_check
      check (income_type in ('one_time', 'recurring'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.income_schedule'::regclass
      and conname = 'income_schedule_confidence_check'
  ) then
    alter table public.income_schedule
      add constraint income_schedule_confidence_check
      check (confidence in ('estimated', 'likely', 'confirmed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.income_schedule'::regclass
      and conname = 'income_schedule_owner_scope_check'
  ) then
    alter table public.income_schedule
      add constraint income_schedule_owner_scope_check
      check (owner_scope in ('household', 'manuel', 'soraya', 'business'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.income_schedule'::regclass
      and conname = 'income_schedule_destination_source_check'
  ) then
    alter table public.income_schedule
      add constraint income_schedule_destination_source_check
      check (
        destination_account_source is null
        or destination_account_source in ('manual', 'plaid')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.income_schedule'::regclass
      and conname = 'income_schedule_cadence_check'
  ) then
    alter table public.income_schedule
      add constraint income_schedule_cadence_check
      check (cadence in ('one_time', 'weekly', 'biweekly', 'monthly', 'irregular'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.income_schedule'::regclass
      and conname = 'income_schedule_status_check'
  ) then
    alter table public.income_schedule
      add constraint income_schedule_status_check
      check (status in ('expected', 'received', 'missed', 'cancelled'));
  end if;
end $$;

create index if not exists income_schedule_user_id_idx
  on public.income_schedule(user_id);

create index if not exists income_schedule_status_date_idx
  on public.income_schedule(status, next_expected_date);

create index if not exists income_schedule_category_code_idx
  on public.income_schedule(category_code);

alter table public.income_schedule enable row level security;

revoke all on table public.income_schedule from anon;
revoke all on table public.income_schedule from authenticated;
grant select, insert, update on table public.income_schedule to authenticated;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'income_schedule'
  loop
    execute format(
      'drop policy if exists %I on public.income_schedule',
      policy_record.policyname
    );
  end loop;
end $$;

create policy "income_schedule_select_own"
  on public.income_schedule
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "income_schedule_insert_own"
  on public.income_schedule
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "income_schedule_update_own"
  on public.income_schedule
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

do $$
begin
  if to_regclass('public.transaction_categories') is not null then
    with parent as (
      select id
      from public.transaction_categories
      where code = 'income'
        and is_system = true
        and user_id is null
      limit 1
    ),
    seed(code, label, sort_order) as (
      values
        ('income_pension', 'Pension', 1107),
        ('income_severance', 'Severance', 1108),
        ('income_unemployment', 'Unemployment', 1109)
    )
    insert into public.transaction_categories (
      code,
      label,
      parent_id,
      kind,
      is_system,
      sort_order
    )
    select
      seed.code,
      seed.label,
      parent.id,
      'income',
      true,
      seed.sort_order
    from seed
    cross join parent
    where not exists (
      select 1
      from public.transaction_categories existing
      where existing.code = seed.code
        and existing.is_system = true
        and existing.user_id is null
    );
  end if;
end $$;
