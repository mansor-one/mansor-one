-- Minimal relation reads required while rebuilding the Financial Engine
-- snapshot in the server-only financial_refresh Plaid synchronization step.
-- Existing RLS and policies remain unchanged.

grant select
  on table
    public.credit_cards,
    public.payment_instances,
    public.scheduled_payments,
    public.income_schedule,
    public.confirmed_ledger_duplicate_resolutions,
    public.obligation_providers,
    public.planning_items
  to service_role;
