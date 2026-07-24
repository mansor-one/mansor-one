-- Migration: Plaid connection portfolio status metadata.
-- Adds local reconnect-needed bookkeeping without revoking Plaid items.

ALTER TABLE IF EXISTS public.plaid_connections
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz DEFAULT now();

UPDATE public.plaid_connections
SET
  status = COALESCE(status, 'active'),
  status_updated_at = COALESCE(status_updated_at, now())
WHERE status IS NULL
   OR status_updated_at IS NULL;

UPDATE public.plaid_connections
SET
  status = 'archived',
  status_updated_at = COALESCE(status_updated_at, now())
WHERE archived_at IS NOT NULL
  AND status IS DISTINCT FROM 'archived';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plaid_connections_status_known'
      AND conrelid = 'public.plaid_connections'::regclass
  ) THEN
    ALTER TABLE public.plaid_connections
      ADD CONSTRAINT plaid_connections_status_known
      CHECK (status IN ('active', 'archived', 'reconnect_needed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS plaid_connections_user_status_idx
  ON public.plaid_connections(user_id, status);
