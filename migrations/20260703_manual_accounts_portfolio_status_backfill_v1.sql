-- Migration: backfill legacy manual account archive status.
-- Keeps history intact while aligning inactive manual accounts with Portfolio status.

UPDATE public.accounts
SET
  account_status = 'archived',
  is_hidden = true,
  updated_at = now()
WHERE is_active IS FALSE
  AND account_status IS DISTINCT FROM 'archived';

UPDATE public.accounts
SET
  is_hidden = true,
  updated_at = now()
WHERE account_status = 'archived'
  AND is_hidden IS DISTINCT FROM true;
