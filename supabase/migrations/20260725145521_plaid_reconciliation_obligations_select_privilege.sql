-- Minimal relation read required by the server-only reconciliation query.
-- Existing RLS and policies remain unchanged.

grant select
  on table public.obligations
  to service_role;
