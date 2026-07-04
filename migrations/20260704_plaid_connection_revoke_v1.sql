-- Migration: Plaid connection revoked state.
-- Adds durable local disconnect metadata without deleting financial history.

ALTER TABLE IF EXISTS public.plaid_connections
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz;

UPDATE public.plaid_connections
SET status_updated_at = COALESCE(status_updated_at, now())
WHERE status_updated_at IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plaid_connections_status_known'
      AND conrelid = 'public.plaid_connections'::regclass
  ) THEN
    ALTER TABLE public.plaid_connections
      DROP CONSTRAINT plaid_connections_status_known;
  END IF;

  ALTER TABLE public.plaid_connections
    ADD CONSTRAINT plaid_connections_status_known
    CHECK (status IN ('active', 'archived', 'reconnect_needed', 'revoked'));
END $$;

CREATE INDEX IF NOT EXISTS plaid_connections_user_disconnected_idx
  ON public.plaid_connections(user_id, disconnected_at);
