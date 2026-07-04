-- Migration: manual account portfolio management metadata.
-- Adds non-destructive hide/archive/replacement fields for Portfolio v1.

ALTER TABLE IF EXISTS public.accounts
  ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'active';

ALTER TABLE IF EXISTS public.accounts
  ADD COLUMN IF NOT EXISTS owner_scope text DEFAULT 'household';

ALTER TABLE IF EXISTS public.accounts
  ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;

ALTER TABLE IF EXISTS public.accounts
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

ALTER TABLE IF EXISTS public.accounts
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE IF EXISTS public.accounts
  ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE IF EXISTS public.accounts
  ADD COLUMN IF NOT EXISTS replacement_account_id uuid;

ALTER TABLE IF EXISTS public.accounts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.accounts
SET
  account_status = CASE
    WHEN is_active IS FALSE THEN 'archived'
    WHEN is_hidden IS TRUE THEN 'hidden'
    ELSE 'active'
  END,
  owner_scope = COALESCE(owner_scope, 'household'),
  is_hidden = COALESCE(is_hidden, false),
  updated_at = COALESCE(updated_at, now())
WHERE account_status IS NULL
   OR (
     account_status = 'active'
     AND is_active IS FALSE
   )
   OR owner_scope IS NULL
   OR is_hidden IS NULL
   OR updated_at IS NULL;

UPDATE public.accounts
SET
  is_hidden = true,
  updated_at = COALESCE(updated_at, now())
WHERE account_status = 'archived'
  AND is_hidden IS DISTINCT FROM true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_status_known'
      AND conrelid = 'public.accounts'::regclass
  ) THEN
    ALTER TABLE public.accounts
      ADD CONSTRAINT accounts_status_known
      CHECK (account_status IN ('active', 'hidden', 'archived'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_replacement_fk'
      AND conrelid = 'public.accounts'::regclass
  ) THEN
    ALTER TABLE public.accounts
      ADD CONSTRAINT accounts_replacement_fk
      FOREIGN KEY (replacement_account_id)
      REFERENCES public.accounts(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS accounts_user_status_idx
  ON public.accounts(user_id, account_status);

CREATE INDEX IF NOT EXISTS accounts_replacement_account_id_idx
  ON public.accounts(replacement_account_id);
