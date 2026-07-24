-- Migration: non-destructive Plaid account portfolio metadata.
-- Adds local visibility and ownership controls without touching Plaid history.

ALTER TABLE IF EXISTS public.plaid_accounts
  ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE IF EXISTS public.plaid_accounts
  ADD COLUMN IF NOT EXISTS owner_scope text DEFAULT 'household';

ALTER TABLE IF EXISTS public.plaid_accounts
  ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'active';

ALTER TABLE IF EXISTS public.plaid_accounts
  ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;

ALTER TABLE IF EXISTS public.plaid_accounts
  ADD COLUMN IF NOT EXISTS include_in_dashboard boolean DEFAULT true;

ALTER TABLE IF EXISTS public.plaid_accounts
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

ALTER TABLE IF EXISTS public.plaid_accounts
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE IF EXISTS public.plaid_accounts
  ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE IF EXISTS public.plaid_accounts
  ADD COLUMN IF NOT EXISTS portfolio_updated_at timestamptz DEFAULT now();

UPDATE public.plaid_accounts
SET
  display_name = COALESCE(display_name, name),
  owner_scope = COALESCE(owner_scope, 'household'),
  account_status = COALESCE(account_status, 'active'),
  is_hidden = COALESCE(is_hidden, false),
  include_in_dashboard = COALESCE(include_in_dashboard, true),
  portfolio_updated_at = COALESCE(portfolio_updated_at, now())
WHERE display_name IS NULL
   OR owner_scope IS NULL
   OR account_status IS NULL
   OR is_hidden IS NULL
   OR include_in_dashboard IS NULL
   OR portfolio_updated_at IS NULL;

UPDATE public.plaid_accounts
SET
  is_hidden = true,
  include_in_dashboard = false,
  portfolio_updated_at = COALESCE(portfolio_updated_at, now())
WHERE account_status = 'archived'
  AND (
    is_hidden IS DISTINCT FROM true
    OR include_in_dashboard IS DISTINCT FROM false
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plaid_accounts_status_known'
      AND conrelid = 'public.plaid_accounts'::regclass
  ) THEN
    ALTER TABLE public.plaid_accounts
      ADD CONSTRAINT plaid_accounts_status_known
      CHECK (account_status IN ('active', 'hidden', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS plaid_accounts_user_status_idx
  ON public.plaid_accounts(user_id, account_status);

CREATE INDEX IF NOT EXISTS plaid_accounts_user_dashboard_idx
  ON public.plaid_accounts(user_id, include_in_dashboard);
