-- Confirmed Ledger Duplicate Resolution v1
-- Review/apply manually. This migration preserves quick_entries and records
-- explicit duplicate-resolution state for confirmed ledger rows.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.confirmed_ledger_duplicate_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  duplicate_quick_entry_id uuid NOT NULL REFERENCES public.quick_entries(id),
  survivor_quick_entry_id uuid NOT NULL REFERENCES public.quick_entries(id),
  resolution_type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  reason text NOT NULL,
  fingerprint text NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reversed_at timestamptz NULL,
  reversed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  source_connection_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT confirmed_ledger_duplicate_resolutions_distinct_entries
    CHECK (duplicate_quick_entry_id <> survivor_quick_entry_id),
  CONSTRAINT confirmed_ledger_duplicate_resolutions_type_check
    CHECK (
      resolution_type IN (
        'exact_duplicate',
        'user_confirmed_duplicate',
        'kept_separate'
      )
    ),
  CONSTRAINT confirmed_ledger_duplicate_resolutions_status_check
    CHECK (status IN ('active', 'reversed')),
  CONSTRAINT confirmed_ledger_duplicate_resolutions_reversal_check
    CHECK (
      (status = 'active' AND reversed_at IS NULL AND reversed_by IS NULL)
      OR
      (status = 'reversed' AND reversed_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS confirmed_ledger_duplicate_one_active_idx
  ON public.confirmed_ledger_duplicate_resolutions(
    user_id,
    duplicate_quick_entry_id
  )
  WHERE status = 'active'
    AND resolution_type IN ('exact_duplicate', 'user_confirmed_duplicate');

CREATE INDEX IF NOT EXISTS confirmed_ledger_duplicate_resolutions_user_idx
  ON public.confirmed_ledger_duplicate_resolutions(user_id);

CREATE INDEX IF NOT EXISTS confirmed_ledger_duplicate_resolutions_survivor_idx
  ON public.confirmed_ledger_duplicate_resolutions(survivor_quick_entry_id);

CREATE INDEX IF NOT EXISTS confirmed_ledger_duplicate_resolutions_fingerprint_idx
  ON public.confirmed_ledger_duplicate_resolutions(user_id, fingerprint);

ALTER TABLE public.confirmed_ledger_duplicate_resolutions
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.confirmed_ledger_duplicate_resolutions FROM anon;
REVOKE ALL ON TABLE public.confirmed_ledger_duplicate_resolutions FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.confirmed_ledger_duplicate_resolutions TO authenticated;

DROP POLICY IF EXISTS "confirmed_ledger_duplicate_resolutions_select_own"
  ON public.confirmed_ledger_duplicate_resolutions;

CREATE POLICY "confirmed_ledger_duplicate_resolutions_select_own"
  ON public.confirmed_ledger_duplicate_resolutions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "confirmed_ledger_duplicate_resolutions_insert_own"
  ON public.confirmed_ledger_duplicate_resolutions;

CREATE POLICY "confirmed_ledger_duplicate_resolutions_insert_own"
  ON public.confirmed_ledger_duplicate_resolutions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (resolved_by IS NULL OR resolved_by = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.quick_entries duplicate_entry
      WHERE duplicate_entry.id = duplicate_quick_entry_id
        AND duplicate_entry.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.quick_entries survivor_entry
      WHERE survivor_entry.id = survivor_quick_entry_id
        AND survivor_entry.user_id = auth.uid()
    )
  );
