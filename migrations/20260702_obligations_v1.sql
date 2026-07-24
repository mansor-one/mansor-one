-- Obligations v1 foundation.
-- Creates a dedicated recurring-obligation domain without connecting UI,
-- migrating scheduled_payments, or seeding real household data.

create extension if not exists pgcrypto;

create table if not exists public.obligations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  category_code text,
  owner text not null default 'household',
  obligation_type text not null default 'other',
  default_amount numeric,
  amount_is_estimated boolean not null default false,
  frequency text not null default 'monthly',
  due_day integer,
  grace_period_days integer not null default 0,
  payment_method text,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obligations_default_amount_nonnegative
    check (default_amount is null or default_amount >= 0),
  constraint obligations_due_day_range
    check (due_day is null or (due_day >= 1 and due_day <= 31)),
  constraint obligations_grace_period_nonnegative
    check (grace_period_days >= 0),
  constraint obligations_owner_known
    check (owner in ('Manuel', 'Soraya', 'household', 'unknown')),
  constraint obligations_type_known
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
    ),
  constraint obligations_frequency_known
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
    )
);

create unique index if not exists obligations_id_user_id_unique
  on public.obligations(id, user_id);

create index if not exists obligations_user_id_idx
  on public.obligations(user_id);

create index if not exists obligations_user_active_idx
  on public.obligations(user_id, is_active);

create index if not exists obligations_user_due_day_idx
  on public.obligations(user_id, due_day)
  where due_day is not null;

create table if not exists public.obligation_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  obligation_id uuid not null,
  provider_name text not null,
  phone text,
  payment_method text,
  active_from date,
  active_until date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obligation_providers_active_range
    check (active_until is null or active_from is null or active_until >= active_from),
  constraint obligation_providers_obligation_user_fk
    foreign key (obligation_id, user_id)
    references public.obligations(id, user_id)
    on delete cascade
);

create unique index if not exists obligation_providers_id_user_id_unique
  on public.obligation_providers(id, user_id);

create index if not exists obligation_providers_user_id_idx
  on public.obligation_providers(user_id);

create index if not exists obligation_providers_obligation_id_idx
  on public.obligation_providers(obligation_id);

create index if not exists obligation_providers_active_idx
  on public.obligation_providers(obligation_id, active_from, active_until);

create table if not exists public.obligation_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  obligation_id uuid not null,
  provider_id uuid,
  expected_date date not null,
  effective_due_date date not null,
  amount_expected numeric,
  amount_is_estimated boolean not null default false,
  status text not null default 'pending',
  source text not null default 'generated',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obligation_instances_amount_nonnegative
    check (amount_expected is null or amount_expected >= 0),
  constraint obligation_instances_status_known
    check (
      status in (
        'pending',
        'initiated',
        'confirmed',
        'closed',
        'skipped',
        'cancelled'
      )
    ),
  constraint obligation_instances_source_known
    check (source in ('generated', 'manual')),
  constraint obligation_instances_obligation_user_fk
    foreign key (obligation_id, user_id)
    references public.obligations(id, user_id)
    on delete cascade,
  constraint obligation_instances_provider_user_fk
    foreign key (provider_id, user_id)
    references public.obligation_providers(id, user_id)
);

create unique index if not exists obligation_instances_id_user_id_unique
  on public.obligation_instances(id, user_id);

create unique index if not exists obligation_instances_unique_cycle
  on public.obligation_instances(obligation_id, expected_date)
  where status <> 'cancelled';

create index if not exists obligation_instances_user_id_idx
  on public.obligation_instances(user_id);

create index if not exists obligation_instances_obligation_id_idx
  on public.obligation_instances(obligation_id);

create index if not exists obligation_instances_user_status_due_idx
  on public.obligation_instances(user_id, status, effective_due_date);

create index if not exists obligation_instances_due_idx
  on public.obligation_instances(effective_due_date);

create table if not exists public.obligation_payment_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  obligation_instance_id uuid not null,
  quick_entry_id uuid,
  plaid_import_id uuid,
  link_source text not null default 'manual',
  confidence numeric,
  linked_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obligation_payment_links_has_source
    check (quick_entry_id is not null or plaid_import_id is not null),
  constraint obligation_payment_links_confidence_range
    check (confidence is null or (confidence >= 0 and confidence <= 100)),
  constraint obligation_payment_links_source_known
    check (link_source in ('manual', 'reconciliation', 'system')),
  constraint obligation_payment_links_instance_user_fk
    foreign key (obligation_instance_id, user_id)
    references public.obligation_instances(id, user_id)
    on delete cascade,
  constraint obligation_payment_links_quick_entry_fk
    foreign key (quick_entry_id)
    references public.quick_entries(id),
  constraint obligation_payment_links_plaid_import_fk
    foreign key (plaid_import_id)
    references public.plaid_imports(id)
);

create index if not exists obligation_payment_links_user_id_idx
  on public.obligation_payment_links(user_id);

create index if not exists obligation_payment_links_instance_id_idx
  on public.obligation_payment_links(obligation_instance_id);

create index if not exists obligation_payment_links_quick_entry_id_idx
  on public.obligation_payment_links(quick_entry_id)
  where quick_entry_id is not null;

create index if not exists obligation_payment_links_plaid_import_id_idx
  on public.obligation_payment_links(plaid_import_id)
  where plaid_import_id is not null;

grant select, insert, update, delete on public.obligations to authenticated;
grant select, insert, update, delete on public.obligation_providers to authenticated;
grant select, insert, update, delete on public.obligation_instances to authenticated;
grant select, insert, update, delete on public.obligation_payment_links to authenticated;

alter table public.obligations enable row level security;
alter table public.obligation_providers enable row level security;
alter table public.obligation_instances enable row level security;
alter table public.obligation_payment_links enable row level security;

drop policy if exists obligations_select_own on public.obligations;
create policy obligations_select_own
  on public.obligations
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists obligations_insert_own on public.obligations;
create policy obligations_insert_own
  on public.obligations
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists obligations_update_own on public.obligations;
create policy obligations_update_own
  on public.obligations
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists obligations_delete_own on public.obligations;
create policy obligations_delete_own
  on public.obligations
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists obligation_providers_select_own on public.obligation_providers;
create policy obligation_providers_select_own
  on public.obligation_providers
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists obligation_providers_insert_own on public.obligation_providers;
create policy obligation_providers_insert_own
  on public.obligation_providers
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists obligation_providers_update_own on public.obligation_providers;
create policy obligation_providers_update_own
  on public.obligation_providers
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists obligation_providers_delete_own on public.obligation_providers;
create policy obligation_providers_delete_own
  on public.obligation_providers
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists obligation_instances_select_own on public.obligation_instances;
create policy obligation_instances_select_own
  on public.obligation_instances
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists obligation_instances_insert_own on public.obligation_instances;
create policy obligation_instances_insert_own
  on public.obligation_instances
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists obligation_instances_update_own on public.obligation_instances;
create policy obligation_instances_update_own
  on public.obligation_instances
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists obligation_instances_delete_own on public.obligation_instances;
create policy obligation_instances_delete_own
  on public.obligation_instances
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists obligation_payment_links_select_own on public.obligation_payment_links;
create policy obligation_payment_links_select_own
  on public.obligation_payment_links
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists obligation_payment_links_insert_own on public.obligation_payment_links;
create policy obligation_payment_links_insert_own
  on public.obligation_payment_links
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists obligation_payment_links_update_own on public.obligation_payment_links;
create policy obligation_payment_links_update_own
  on public.obligation_payment_links
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists obligation_payment_links_delete_own on public.obligation_payment_links;
create policy obligation_payment_links_delete_own
  on public.obligation_payment_links
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Optional future seed examples, intentionally not executed:
-- Toyota car payment: monthly loan obligation, due day 18, grace period 15.
-- Honda car payment: monthly loan obligation, due day/grace period TBD.
-- Lawn service / Recorte de grama: monthly household service, ATH Movil.
-- Pest control / Fumigador: every 3 months, estimated amount, last service March 2026.
-- Water bill: monthly utility obligation with estimated amount from prior cycle.
