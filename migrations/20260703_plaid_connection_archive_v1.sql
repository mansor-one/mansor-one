-- Migration: non-destructive Plaid connection archive metadata
-- Preserves existing connections, accounts, and imports.

ALTER TABLE IF EXISTS public.plaid_connections
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

ALTER TABLE IF EXISTS public.plaid_connections
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE IF EXISTS public.plaid_connections
  ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE IF EXISTS public.plaid_connections
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;

ALTER TABLE IF EXISTS public.plaid_connections
  ADD COLUMN IF NOT EXISTS last_sync_error text;

UPDATE public.plaid_connections
SET status = 'active'
WHERE status IS NULL;

