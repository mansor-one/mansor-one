alter table public.plaid_connections
  add column if not exists last_sync_attempt_at timestamptz,
  add column if not exists last_repair_success_at timestamptz;

comment on column public.plaid_connections.last_sync_attempt_at is
  'Most recent connection-specific Plaid synchronization attempt, successful or not.';

comment on column public.plaid_connections.last_repair_success_at is
  'Most recent Update Mode completion verified healthy through Plaid item/get.';
