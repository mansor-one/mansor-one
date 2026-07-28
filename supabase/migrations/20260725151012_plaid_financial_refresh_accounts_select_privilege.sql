-- Minimal manual-account read required while rebuilding the Financial Engine
-- snapshot in the server-only financial_refresh Plaid synchronization step.
-- Existing RLS and policies remain unchanged.

grant select
  on table public.accounts
  to service_role;
