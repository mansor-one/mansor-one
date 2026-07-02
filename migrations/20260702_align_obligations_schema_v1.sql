-- Align Obligations v1 schema with the accepted ADR/docs model.
--
-- Root issue this protects against:
-- `create table if not exists public.obligations (...)` does not add columns
-- when an older `obligations` table already exists. The accepted model uses
-- `obligations.name` as the display name, but some environments may have a
-- pre-existing table without that column.
--
-- Safe behavior:
-- - Adds missing columns only.
-- - Attempts to backfill `name` from common legacy display columns if present.
-- - Does not drop or rename existing columns.

alter table public.obligations
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists category_code text,
  add column if not exists owner text not null default 'household',
  add column if not exists obligation_type text not null default 'other',
  add column if not exists default_amount numeric,
  add column if not exists amount_is_estimated boolean not null default false,
  add column if not exists frequency text not null default 'monthly',
  add column if not exists due_day integer,
  add column if not exists grace_period_days integer not null default 0,
  add column if not exists payment_method text,
  add column if not exists is_active boolean not null default true,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'obligations'
      and column_name = 'title'
  ) then
    execute $sql$
      update public.obligations
      set name = nullif(trim(title), '')
      where (name is null or trim(name) = '')
        and title is not null
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'obligations'
      and column_name = 'label'
  ) then
    execute $sql$
      update public.obligations
      set name = nullif(trim(label), '')
      where (name is null or trim(name) = '')
        and label is not null
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'obligations'
      and column_name = 'obligation_name'
  ) then
    execute $sql$
      update public.obligations
      set name = nullif(trim(obligation_name), '')
      where (name is null or trim(name) = '')
        and obligation_name is not null
    $sql$;
  end if;
end $$;

update public.obligations
set name = concat('Obligation ', left(id::text, 8))
where name is null
   or trim(name) = '';

alter table public.obligations
  alter column name set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'obligations_default_amount_nonnegative'
  ) then
    alter table public.obligations
      add constraint obligations_default_amount_nonnegative
      check (default_amount is null or default_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'obligations_due_day_range'
  ) then
    alter table public.obligations
      add constraint obligations_due_day_range
      check (due_day is null or (due_day >= 1 and due_day <= 31));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'obligations_grace_period_nonnegative'
  ) then
    alter table public.obligations
      add constraint obligations_grace_period_nonnegative
      check (grace_period_days >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'obligations_owner_known'
  ) then
    alter table public.obligations
      add constraint obligations_owner_known
      check (owner in ('Manuel', 'Soraya', 'household', 'unknown'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'obligations_type_known'
  ) then
    alter table public.obligations
      add constraint obligations_type_known
      check (
        obligation_type in (
          'loan',
          'service',
          'utility',
          'subscription',
          'insurance',
          'tax',
          'other'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'obligations_frequency_known'
  ) then
    alter table public.obligations
      add constraint obligations_frequency_known
      check (
        frequency in (
          'weekly',
          'biweekly',
          'monthly',
          'quarterly',
          'every_3_months',
          'annual',
          'custom'
        )
      );
  end if;
end $$;

create unique index if not exists obligations_id_user_id_unique
  on public.obligations(id, user_id);

create index if not exists obligations_user_id_idx
  on public.obligations(user_id);

create index if not exists obligations_user_active_idx
  on public.obligations(user_id, is_active);

create index if not exists obligations_user_due_day_idx
  on public.obligations(user_id, due_day)
  where due_day is not null;
