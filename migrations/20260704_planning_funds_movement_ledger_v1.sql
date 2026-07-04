-- Migration: Planning funds movement ledger RLS and atomic writer.
-- Enables immutable owner-scoped movement history for Priorities & Funds.

ALTER TABLE IF EXISTS public.planning_item_transactions
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.planning_item_transactions FROM anon;
REVOKE ALL ON TABLE public.planning_item_transactions FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.planning_item_transactions TO authenticated;

DROP POLICY IF EXISTS "planning_item_transactions_select_own"
  ON public.planning_item_transactions;

CREATE POLICY "planning_item_transactions_select_own"
  ON public.planning_item_transactions
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "planning_item_transactions_insert_own"
  ON public.planning_item_transactions;

CREATE POLICY "planning_item_transactions_insert_own"
  ON public.planning_item_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND planning_item_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.planning_items pi
      WHERE pi.id = planning_item_id
        AND pi.user_id = (SELECT auth.uid())
    )
    AND (
      from_item_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.planning_items pi
        WHERE pi.id = from_item_id
          AND pi.user_id = (SELECT auth.uid())
      )
    )
    AND (
      to_item_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.planning_items pi
        WHERE pi.id = to_item_id
          AND pi.user_id = (SELECT auth.uid())
      )
    )
  );

CREATE OR REPLACE FUNCTION public.record_planning_fund_movement(
  p_planning_item_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_notes text DEFAULT NULL
)
RETURNS public.planning_item_transactions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_current_amount numeric;
  v_next_amount numeric;
  v_amount numeric;
  v_movement public.planning_item_transactions;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF p_transaction_type NOT IN ('assign', 'remove') THEN
    RAISE EXCEPTION 'Unsupported planning movement type: %', p_transaction_type
      USING ERRCODE = '22023';
  END IF;

  v_amount := round(COALESCE(p_amount, 0), 2);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Movement amount must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(current_amount, 0)
    INTO v_current_amount
  FROM public.planning_items
  WHERE id = p_planning_item_id
    AND user_id = v_user_id
    AND COALESCE(is_archived, false) = false
    AND COALESCE(is_completed, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Planning fund not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_transaction_type = 'assign' THEN
    v_next_amount := v_current_amount + v_amount;
  ELSE
    v_next_amount := GREATEST(0, v_current_amount - v_amount);
  END IF;

  UPDATE public.planning_items
  SET current_amount = v_next_amount,
      updated_at = now()
  WHERE id = p_planning_item_id
    AND user_id = v_user_id;

  INSERT INTO public.planning_item_transactions (
    planning_item_id,
    transaction_type,
    amount,
    notes,
    user_id
  )
  VALUES (
    p_planning_item_id,
    p_transaction_type,
    v_amount,
    NULLIF(btrim(p_notes), ''),
    v_user_id
  )
  RETURNING * INTO v_movement;

  RETURN v_movement;
END;
$$;

REVOKE ALL ON FUNCTION public.record_planning_fund_movement(uuid, text, numeric, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_planning_fund_movement(uuid, text, numeric, text)
  TO authenticated;
