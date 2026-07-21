-- Observable, per-user Plaid synchronization runs. No financial rows are rewritten here.
create table if not exists public.plaid_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger text not null default 'manual' check (trigger in ('manual', 'daily', 'retry')),
  daily_window_key date,
  status text not null default 'queued' check (status in ('queued', 'running', 'partially_completed', 'completed', 'failed')),
  current_step text,
  completed_steps integer not null default 0 check (completed_steps between 0 and 5),
  total_steps integer not null default 5 check (total_steps = 5),
  percentage integer not null default 0 check (percentage between 0 and 100),
  started_at timestamptz,
  completed_at timestamptz,
  last_heartbeat_at timestamptz,
  lock_expires_at timestamptz,
  duration_ms integer,
  error_message text,
  retryable_step text,
  step_results jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  retry_of_run_id uuid references public.plaid_sync_runs(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists plaid_sync_runs_one_active_per_user
  on public.plaid_sync_runs(user_id)
  where status in ('queued', 'running');
create unique index if not exists plaid_sync_runs_one_daily_window
  on public.plaid_sync_runs(user_id, daily_window_key)
  where trigger = 'daily' and daily_window_key is not null;
create index if not exists plaid_sync_runs_user_created_idx
  on public.plaid_sync_runs(user_id, created_at desc);
create index if not exists plaid_sync_runs_retry_of_idx
  on public.plaid_sync_runs(retry_of_run_id)
  where retry_of_run_id is not null;

alter table public.plaid_sync_runs enable row level security;
drop policy if exists "Users can read their Plaid sync runs" on public.plaid_sync_runs;
create policy "Users can read their Plaid sync runs"
  on public.plaid_sync_runs for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.plaid_sync_runs to authenticated;
grant all on public.plaid_sync_runs to service_role;
