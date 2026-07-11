-- Confirmed Ledger Duplicate Resolution v1: June 2026 candidate report
-- Read-only report. Do not execute any INSERT/UPDATE/DELETE from this file.
-- This intentionally does not auto-resolve the 33 proven groups.

WITH ledger_rows AS (
  SELECT
    qe.id AS quick_entry_id,
    qe.user_id,
    qe.entry_date,
    qe.created_at,
    qe.description,
    qe.amount,
    qe.category,
    qe.source,
    qe.plaid_transaction_id,
    pi.id AS plaid_import_id,
    pi.plaid_account_id,
    pi.institution_name,
    pi.account_name,
    pi.account_mask,
    pi.account_type,
    pi.account_subtype,
    lower(
      regexp_replace(
        regexp_replace(
          coalesce(qe.description, ''),
          '[^a-zA-Z0-9 ]',
          ' ',
          'g'
        ),
        '\s+',
        ' ',
        'g'
      )
    ) AS normalized_description
  FROM public.quick_entries qe
  LEFT JOIN public.plaid_imports pi
    ON pi.plaid_transaction_id = qe.plaid_transaction_id
   AND pi.user_id = qe.user_id
  WHERE qe.entry_date >= DATE '2026-06-01'
    AND qe.entry_date < DATE '2026-07-01'
    AND qe.amount > 0
    AND qe.source = 'plaid'
),
fingerprinted AS (
  SELECT
    *,
    concat_ws(
      '|',
      normalized_description,
      entry_date::text,
      round(abs(amount)::numeric, 2)::text,
      lower(coalesce(institution_name, 'unknown')),
      lower(coalesce(account_name, 'unknown')),
      coalesce(account_mask, 'unknown')
    ) AS duplicate_fingerprint
  FROM ledger_rows
)
SELECT
  duplicate_fingerprint,
  count(*) AS row_count,
  min(created_at) AS first_created_at,
  max(created_at) AS last_created_at,
  min(quick_entry_id::text) AS suggested_survivor_quick_entry_id,
  jsonb_agg(
    jsonb_build_object(
      'quick_entry_id', quick_entry_id,
      'plaid_import_id', plaid_import_id,
      'plaid_transaction_id', plaid_transaction_id,
      'plaid_account_id', plaid_account_id,
      'description', description,
      'entry_date', entry_date,
      'amount', amount,
      'category', category,
      'institution_name', institution_name,
      'account_name', account_name,
      'account_mask', account_mask,
      'created_at', created_at
    )
    ORDER BY created_at, quick_entry_id
  ) AS candidate_rows
FROM fingerprinted
GROUP BY duplicate_fingerprint
HAVING count(*) > 1
ORDER BY first_created_at, duplicate_fingerprint;
