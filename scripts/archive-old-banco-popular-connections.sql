-- Proposal only. Do not run until approved.
-- Non-destructively archive duplicate Banco Popular connections while preserving
-- plaid_connections, plaid_accounts, and plaid_imports history.

UPDATE public.plaid_connections
SET
  status = 'archived',
  archived_at = now(),
  archive_reason = 'Archived duplicate Banco Popular connection after 2026-07-02 reconnect'
WHERE id IN (
  'd51892d7-feff-416e-80c6-f368ae6e2b11',
  '38bc4ed6-2103-45e3-b0ec-68ecd36cf7d0'
)
AND id <> '3015d51a-94d1-452a-937b-566661452f1b';

