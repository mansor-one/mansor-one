begin;

-- Phase 1A is server-side only. Reset these three tables to the exact minimum
-- privileges needed by the service-role data-access paths.
revoke all privileges
  on table public.transaction_enrichments
  from service_role;

revoke all privileges
  on table public.transaction_suggestions
  from service_role;

revoke all privileges
  on table public.transaction_review_items
  from service_role;

grant select, insert, update
  on table public.transaction_enrichments
  to service_role;

grant select, insert, update
  on table public.transaction_suggestions
  to service_role;

grant select, insert
  on table public.transaction_review_items
  to service_role;

commit;
