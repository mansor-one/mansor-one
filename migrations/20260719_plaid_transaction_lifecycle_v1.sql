-- Targeted Plaid pending/posted lifecycle support.
-- Preserves every financial row; lifecycle flags control active projections.

alter table public.plaid_imports
  add column if not exists pending boolean not null default false,
  add column if not exists pending_transaction_id text null,
  add column if not exists transaction_status text not null default 'active',
  add column if not exists superseded_by_transaction_id text null,
  add column if not exists superseded_at timestamptz null,
  add column if not exists removed_at timestamptz null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.plaid_connections
  add column if not exists transactions_cursor text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.plaid_imports'::regclass
      and conname = 'plaid_imports_transaction_status_check'
  ) then
    alter table public.plaid_imports
      add constraint plaid_imports_transaction_status_check
      check (transaction_status in (
        'active', 'pending', 'superseded', 'replaced', 'removed',
        'rejected', 'duplicate'
      ));
  end if;
end $$;

create index if not exists plaid_imports_pending_transaction_id_idx
  on public.plaid_imports(user_id, pending_transaction_id)
  where pending_transaction_id is not null;

create index if not exists plaid_imports_status_date_idx
  on public.plaid_imports(user_id, transaction_status, transaction_date);
