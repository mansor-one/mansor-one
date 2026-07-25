-- PROPOSAL ONLY. DO NOT APPLY WITHOUT APPROVAL AND END-TO-END TESTING.
-- Purpose: reduce authenticated privileges on append-only financial history.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

-- Household members may inspect and create reconciliation evidence, but must
-- not rewrite or delete history.
revoke update, delete on table public.obligation_reconciliation_events
  from authenticated;
drop policy if exists obligation_reconciliation_events_household_update
  on public.obligation_reconciliation_events;
drop policy if exists obligation_reconciliation_events_household_delete
  on public.obligation_reconciliation_events;

revoke update, delete on table public.review_queue_resolution_events
  from authenticated;
drop policy if exists review_queue_resolution_events_household_update
  on public.review_queue_resolution_events;
drop policy if exists review_queue_resolution_events_household_delete
  on public.review_queue_resolution_events;

-- Sync orchestration is service-written. The browser only observes progress.
revoke insert, update, delete on table public.plaid_sync_runs
  from authenticated;
drop policy if exists plaid_sync_runs_household_insert
  on public.plaid_sync_runs;
drop policy if exists plaid_sync_runs_household_update
  on public.plaid_sync_runs;
drop policy if exists plaid_sync_runs_household_delete
  on public.plaid_sync_runs;
grant select on table public.plaid_sync_runs to authenticated;

commit;
