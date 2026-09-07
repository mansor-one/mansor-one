-- Keep Plaid visual metadata server-managed without changing row-level policy.
-- Table-level privileges must be revoked first because they override narrower
-- column-level grants.

revoke update on table public.plaid_connections from authenticated;
grant update (
  status,
  archived_at,
  archive_reason,
  last_sync_error,
  status_updated_at,
  disconnected_at,
  last_sync_attempt_at,
  last_repair_success_at,
  last_sync_at
) on table public.plaid_connections to authenticated;

revoke update on table public.plaid_imports from authenticated;
grant update (
  imported
) on table public.plaid_imports to authenticated;

revoke insert on table public.plaid_connections from authenticated;
grant insert (
  id,
  user_id,
  institution_name,
  item_id,
  access_token,
  created_at,
  encrypted_access_token,
  token_iv,
  token_auth_tag,
  status,
  archived_at,
  archive_reason,
  last_sync_at,
  last_sync_error,
  status_updated_at,
  disconnected_at,
  transactions_cursor,
  household_id,
  last_sync_attempt_at,
  last_repair_success_at
) on table public.plaid_connections to authenticated;

revoke insert on table public.plaid_imports from authenticated;
grant insert (
  id,
  plaid_transaction_id,
  transaction_date,
  merchant,
  amount,
  plaid_category,
  suggested_category,
  imported,
  created_at,
  user_id,
  plaid_account_id,
  account_name,
  institution_name,
  account_type,
  account_subtype,
  account_mask,
  pending,
  pending_transaction_id,
  transaction_status,
  superseded_by_transaction_id,
  superseded_at,
  removed_at,
  updated_at,
  household_id
) on table public.plaid_imports to authenticated;
