alter table public.obligation_payment_links
  add column if not exists reconciliation_status text not null default 'detected',
  add column if not exists score_factors jsonb not null default '[]'::jsonb,
  add column if not exists confirmed_at timestamptz,
  add column if not exists reconciled_at timestamptz,
  add column if not exists payment_method text,
  add column if not exists confirmation_note text;

alter table public.obligation_payment_links
  drop constraint if exists obligation_payment_links_has_source;

alter table public.obligation_payment_links
  add constraint obligation_payment_links_has_source
  check (
    quick_entry_id is not null
    or plaid_import_id is not null
    or reconciliation_status = 'pending_settlement'
  );

alter table public.obligation_payment_links
  drop constraint if exists obligation_payment_links_reconciliation_status_known;

alter table public.obligation_payment_links
  add constraint obligation_payment_links_reconciliation_status_known
  check (reconciliation_status in ('detected', 'pending_settlement', 'reconciled', 'rejected'));

update public.obligation_payment_links links
set reconciliation_status = 'reconciled',
    reconciled_at = coalesce(links.reconciled_at, links.linked_at)
from public.obligation_instances instances
where instances.id = links.obligation_instance_id
  and instances.status in ('confirmed', 'closed');

create unique index if not exists obligation_payment_links_unique_quick_entry
  on public.obligation_payment_links(obligation_instance_id, quick_entry_id)
  where quick_entry_id is not null;

create unique index if not exists obligation_payment_links_unique_plaid_import
  on public.obligation_payment_links(obligation_instance_id, plaid_import_id)
  where plaid_import_id is not null;

create unique index if not exists obligation_payment_links_one_reconciled_transaction
  on public.obligation_payment_links(plaid_import_id)
  where plaid_import_id is not null and reconciliation_status = 'reconciled';

create unique index if not exists obligation_payment_links_one_manual_pending
  on public.obligation_payment_links(obligation_instance_id)
  where reconciliation_status = 'pending_settlement'
    and quick_entry_id is null
    and plaid_import_id is null;

create table if not exists public.obligation_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  obligation_instance_id uuid not null,
  payment_link_id uuid,
  event_type text not null,
  from_status text,
  to_status text not null,
  confidence numeric,
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint obligation_reconciliation_events_instance_user_fk
    foreign key (obligation_instance_id, user_id)
    references public.obligation_instances(id, user_id)
    on delete cascade,
  constraint obligation_reconciliation_events_link_fk
    foreign key (payment_link_id)
    references public.obligation_payment_links(id)
    on delete set null,
  constraint obligation_reconciliation_events_confidence_range
    check (confidence is null or (confidence >= 0 and confidence <= 100)),
  constraint obligation_reconciliation_events_type_known
    check (event_type in ('payment_detected', 'manual_confirmation', 'auto_reconciled', 'manual_reconciled', 'rejected'))
);

create index if not exists obligation_reconciliation_events_user_time_idx
  on public.obligation_reconciliation_events(user_id, occurred_at desc);

create index if not exists obligation_reconciliation_events_instance_time_idx
  on public.obligation_reconciliation_events(obligation_instance_id, occurred_at desc);

grant select, insert on public.obligation_reconciliation_events to authenticated;
alter table public.obligation_reconciliation_events enable row level security;

drop policy if exists obligation_reconciliation_events_select_own on public.obligation_reconciliation_events;
create policy obligation_reconciliation_events_select_own
  on public.obligation_reconciliation_events for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists obligation_reconciliation_events_insert_own on public.obligation_reconciliation_events;
create policy obligation_reconciliation_events_insert_own
  on public.obligation_reconciliation_events for insert to authenticated
  with check (user_id = (select auth.uid()));
