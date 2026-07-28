-- Minimal table privileges required by the server-only Plaid reconciliation
-- worker. RLS and existing policies are intentionally unchanged.

begin;

grant select, update
  on table public.obligation_instances
  to service_role;

grant select, insert, update
  on table public.obligation_payment_links
  to service_role;

commit;
