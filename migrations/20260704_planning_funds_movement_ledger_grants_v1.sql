-- Migration: tighten Planning funds movement ledger table grants.
-- Leaves movement rows read/insert-only for authenticated users.

REVOKE ALL ON TABLE public.planning_item_transactions FROM anon;
REVOKE ALL ON TABLE public.planning_item_transactions FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.planning_item_transactions TO authenticated;
