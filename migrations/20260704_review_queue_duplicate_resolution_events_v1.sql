-- Migration: Review Queue possible duplicate resolution events.
-- Stores immutable user decisions without deleting Plaid imports or ledger rows.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.review_queue_resolution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaid_import_id uuid NOT NULL REFERENCES public.plaid_imports(id),
  event_type text NOT NULL,
  duplicate_quick_entry_id uuid NULL REFERENCES public.quick_entries(id),
  quick_entry_id uuid NULL REFERENCES public.quick_entries(id),
  match_type text NULL,
  match_confidence numeric NULL,
  reason text NOT NULL,
  candidate_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_queue_resolution_events_event_type_check
    CHECK (
      event_type IN (
        'duplicate_marked',
        'separate_requested',
        'separate_confirmed'
      )
    )
);

ALTER TABLE public.review_queue_resolution_events
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.review_queue_resolution_events FROM anon;
REVOKE ALL ON TABLE public.review_queue_resolution_events FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.review_queue_resolution_events TO authenticated;

DROP POLICY IF EXISTS "review_queue_resolution_events_select_own"
  ON public.review_queue_resolution_events;

CREATE POLICY "review_queue_resolution_events_select_own"
  ON public.review_queue_resolution_events
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "review_queue_resolution_events_insert_own"
  ON public.review_queue_resolution_events;

CREATE POLICY "review_queue_resolution_events_insert_own"
  ON public.review_queue_resolution_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.plaid_imports pi
      WHERE pi.id = plaid_import_id
        AND pi.user_id = (SELECT auth.uid())
    )
    AND (
      duplicate_quick_entry_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.quick_entries qe
        WHERE qe.id = duplicate_quick_entry_id
          AND qe.user_id = (SELECT auth.uid())
      )
    )
    AND (
      quick_entry_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.quick_entries qe
        WHERE qe.id = quick_entry_id
          AND qe.user_id = (SELECT auth.uid())
      )
    )
  );

CREATE INDEX IF NOT EXISTS review_queue_resolution_events_user_idx
  ON public.review_queue_resolution_events(user_id);

CREATE INDEX IF NOT EXISTS review_queue_resolution_events_plaid_import_idx
  ON public.review_queue_resolution_events(plaid_import_id);

CREATE INDEX IF NOT EXISTS review_queue_resolution_events_created_idx
  ON public.review_queue_resolution_events(created_at);
