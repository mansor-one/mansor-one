-- Ensure Plaid accounts are keyed by Plaid's account_id and protected per user.

CREATE UNIQUE INDEX IF NOT EXISTS plaid_accounts_plaid_account_id_key
  ON public.plaid_accounts (plaid_account_id);

ALTER TABLE public.plaid_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plaid_accounts_select_own ON public.plaid_accounts;
CREATE POLICY plaid_accounts_select_own
  ON public.plaid_accounts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS plaid_accounts_insert_own ON public.plaid_accounts;
CREATE POLICY plaid_accounts_insert_own
  ON public.plaid_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS plaid_accounts_update_own ON public.plaid_accounts;
CREATE POLICY plaid_accounts_update_own
  ON public.plaid_accounts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
