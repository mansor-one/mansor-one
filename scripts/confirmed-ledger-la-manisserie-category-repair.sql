-- Confirmed Ledger Category Repair: La Manisserie duplicate survivors
-- Safety contract:
-- - Updates public.quick_entries only.
-- - Restricts scope to exactly three reviewed quick_entry ids.
-- - Requires all three rows to currently have category = 'Revisar'.
-- - Sets category = 'Beauty & Personal Care'.
-- - Appends a non-destructive audit note to quick_entries.notes.
-- - Does not update duplicate resolution rows, amounts, dates, merchants,
--   accounts, Plaid ids, or source data.
-- - No DELETE.

WITH target_rows(id, expected_amount) AS (
  VALUES
    ('63f02a75-0a46-4b33-8de8-a9bbec17838b'::uuid, 40.00::numeric),
    ('8b1451bc-3502-417c-bf32-08523a7eb369'::uuid, 90.00::numeric),
    ('86d2e9da-4230-48e7-9f18-3484811df5e7'::uuid, 95.00::numeric)
),
before_rows AS (
  SELECT
    qe.id,
    qe.user_id,
    qe.entry_date,
    qe.description,
    qe.amount,
    qe.category,
    qe.notes,
    qe.source,
    qe.plaid_transaction_id,
    qe.created_at,
    tr.expected_amount
  FROM target_rows tr
  LEFT JOIN public.quick_entries qe
    ON qe.id = tr.id
),
guard AS (
  SELECT
    count(*) AS found_rows,
    count(*) FILTER (
      WHERE category = 'Revisar'
        AND amount = expected_amount
        AND description = 'La Manisserie'
        AND entry_date = DATE '2026-06-22'
    ) AS eligible_rows,
    coalesce(sum(amount), 0) AS eligible_amount
  FROM before_rows
),
june_active_before AS (
  SELECT qe.*
  FROM public.quick_entries qe
  LEFT JOIN public.confirmed_ledger_duplicate_resolutions cdr
    ON cdr.duplicate_quick_entry_id = qe.id
   AND cdr.status = 'active'
  WHERE qe.entry_date >= DATE '2026-06-01'
    AND qe.entry_date < DATE '2026-07-01'
    AND qe.amount > 0
    AND cdr.id IS NULL
),
june_classified_before AS (
  SELECT
    id,
    amount,
    category,
    description,
    CASE
      WHEN lower(trim(category)) IN (
        'food',
        'restaurants',
        'comida fuera',
        'groceries',
        'supermercado',
        'work cafeteria',
        'fast food',
        'gasolina',
        'parking',
        'tolls',
        'vehicle registration',
        'beauty & personal care',
        'medical',
        'health',
        'laboratorio',
        'dental',
        'farmacia',
        'gifts',
        'clothing',
        'subscriptions',
        'suscripciones',
        'travel',
        'taxes',
        'education',
        'entretenimiento',
        'comida'
      ) THEN 'expense'
      WHEN lower(trim(category)) IN (
        'credit card payment',
        'pago de tarjeta',
        'internal transfer',
        'transferencia recibida',
        'goals',
        'savings',
        'loan payment'
      ) THEN 'non_spending'
      WHEN lower(trim(category)) IN (
        'revisar',
        'sin categoría',
        'sin categoria',
        'uncategorized'
      )
        OR category IS NULL THEN 'pending'
      ELSE 'unknown'
    END AS ledger_kind,
    CASE
      WHEN upper(coalesce(description, '')) LIKE '%MSC CRUISES%' THEN 'expense'
      WHEN upper(coalesce(description, '')) LIKE '%AUTOEXPRESO%' THEN 'expense'
      WHEN upper(coalesce(description, '')) LIKE '%CESCO%'
        OR upper(coalesce(description, '')) LIKE '%MARBET%' THEN 'expense'
      WHEN upper(coalesce(description, '')) LIKE '%COOP LARES%' THEN 'non_spending'
      WHEN upper(coalesce(description, '')) LIKE '%STARBUCKS%' THEN 'expense'
      WHEN upper(coalesce(description, '')) LIKE '%MCDONALD%'
        OR upper(coalesce(description, '')) LIKE '%MC DONALD%'
        OR upper(coalesce(description, '')) LIKE '%BURGER KING%'
        OR upper(coalesce(description, '')) LIKE '%CHURCH%'
        OR upper(coalesce(description, '')) LIKE '%PAPA JOHN%' THEN 'expense'
      WHEN upper(coalesce(description, '')) LIKE '%ICHIBAN%' THEN 'expense'
      WHEN upper(coalesce(description, '')) LIKE '%WALGREENS%'
        OR upper(coalesce(description, '')) LIKE '%CVS%'
        OR upper(coalesce(description, '')) LIKE '%PHARMACY%'
        OR upper(coalesce(description, '')) LIKE '%FARMACIA%' THEN 'expense'
      WHEN upper(coalesce(description, '')) LIKE '%COSTCO%'
        OR upper(coalesce(description, '')) LIKE '%WALMART%'
        OR upper(coalesce(description, '')) LIKE '%ECONO%' THEN 'expense'
      WHEN upper(coalesce(description, '')) LIKE '%OPENAI%'
        OR upper(coalesce(description, '')) LIKE '%APPLE%'
        OR upper(coalesce(description, '')) LIKE '%NINTENDO%' THEN 'expense'
      WHEN upper(coalesce(description, '')) LIKE '%AMAZON PRIME%'
        OR upper(coalesce(description, '')) LIKE '%AMAZON DIGITAL%'
        OR upper(coalesce(description, '')) LIKE '%AMZN DIGITAL%'
        OR upper(coalesce(description, '')) LIKE '%AMZN MKTPLACE DIGITAL%' THEN 'expense'
      WHEN upper(coalesce(description, '')) LIKE '%CARIBBEAN CINEMAS%' THEN 'expense'
      ELSE NULL
    END AS merchant_kind
  FROM june_active_before
),
june_spending_before AS (
  SELECT
    round(
      coalesce(
        sum(amount) FILTER (
          WHERE CASE
            WHEN merchant_kind = 'expense'
              AND ledger_kind IS NOT NULL
              AND ledger_kind <> 'expense' THEN 'expense'
            ELSE coalesce(ledger_kind, merchant_kind)
          END = 'expense'
        ),
        0
      ),
      2
    ) AS amount
  FROM june_classified_before
),
updated AS (
  UPDATE public.quick_entries qe
  SET
    category = 'Beauty & Personal Care',
    notes = concat_ws(
      E'\n',
      nullif(qe.notes, ''),
      '[2026-07-10] Category repaired from Revisar to Beauty & Personal Care after confirmed duplicate survivor audit. Original ledger history and duplicate-resolution rows preserved.'
    )
  FROM target_rows tr
  WHERE qe.id = tr.id
    AND qe.category = 'Revisar'
    AND qe.amount = tr.expected_amount
    AND qe.description = 'La Manisserie'
    AND qe.entry_date = DATE '2026-06-22'
    AND (SELECT found_rows FROM guard) = 3
    AND (SELECT eligible_rows FROM guard) = 3
  RETURNING
    qe.id,
    qe.user_id,
    qe.entry_date,
    qe.description,
    qe.amount,
    qe.category,
    qe.notes,
    qe.source,
    qe.plaid_transaction_id,
    qe.created_at
),
after_rows AS (
  SELECT *
  FROM updated
),
updated_impact AS (
  SELECT coalesce(sum(amount), 0) AS amount
  FROM updated
),
resolution_counts AS (
  SELECT
    count(*) AS active_resolution_rows,
    count(DISTINCT fingerprint) AS active_resolution_groups
  FROM public.confirmed_ledger_duplicate_resolutions
  WHERE status = 'active'
)
SELECT
  (SELECT row_to_json(guard) FROM guard) AS guard,
  (SELECT amount FROM june_spending_before) AS june_spending_before,
  (SELECT amount FROM updated_impact) AS spending_impact,
  (
    (SELECT amount FROM june_spending_before) +
    (SELECT amount FROM updated_impact)
  ) AS june_spending_after_expected,
  (SELECT count(*) FROM updated) AS updated_rows,
  (SELECT jsonb_agg(to_jsonb(before_rows) ORDER BY id) FROM before_rows) AS before_rows,
  (SELECT jsonb_agg(to_jsonb(after_rows) ORDER BY id) FROM after_rows) AS after_rows,
  (SELECT row_to_json(resolution_counts) FROM resolution_counts) AS resolution_counts;
