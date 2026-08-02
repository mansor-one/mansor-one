-- The server-only Plaid reconciliation worker reads existing events to make
-- retries idempotent and appends detected/reconciled audit events.
-- UUID primary keys use gen_random_uuid(), so no sequence grant is required.
-- Normalize inherited/default table privileges before applying the exact set.

revoke all privileges
  on table public.obligation_reconciliation_events
  from service_role;

grant select, insert
  on table public.obligation_reconciliation_events
  to service_role;
