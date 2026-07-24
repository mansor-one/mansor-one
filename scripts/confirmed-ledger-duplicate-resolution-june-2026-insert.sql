-- Confirmed Ledger Duplicate Resolution: June 2026 Banco Popular proven groups
-- REVIEW ONLY until explicitly approved for execution.
--
-- Safety contract:
-- - INSERTs into public.confirmed_ledger_duplicate_resolutions only.
-- - No DELETE.
-- - No UPDATE to quick_entries.
-- - No category changes.
-- - No amount changes.
-- - Skips any group that already has an active duplicate resolution.
-- - Restricts scope to June 2026 Banco Popular Plaid rows.
--
-- Survivor selection:
-- 1. Prefer the row from the active/current Plaid connection.
-- 2. Otherwise prefer the newest connection generation.
-- 3. Otherwise prefer the earliest confirmed quick_entry.

WITH ledger_rows AS (
  SELECT
    qe.id AS quick_entry_id,
    qe.user_id,
    qe.entry_date,
    qe.created_at AS quick_entry_created_at,
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
    pa.connection_id,
    pc.status AS connection_status,
    pc.created_at AS connection_created_at,
    upper(trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(upper(coalesce(qe.description, '')), '&', ' AND ', 'g'), '[#*]\s*\d+', ' ', 'g'), 'STORE', ' ', 'g'), '\yPR\y', ' ', 'g'), 'PUERTO RICO', ' ', 'g'), '\yINC\y', ' ', 'g'), '\yLLC\y', ' ', 'g'), '[^A-Z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'))) AS normalized_description,
    upper(trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(upper(coalesce(pi.institution_name, 'UNKNOWN')), '\yPR\y', ' ', 'g'), 'PUERTO RICO', ' ', 'g'), '\yINC\y', ' ', 'g'), '\yLLC\y', ' ', 'g'), '[^A-Z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'))) AS normalized_institution,
    upper(trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(upper(coalesce(pi.account_name, qe.account_name, 'UNKNOWN')), '\yPR\y', ' ', 'g'), 'PUERTO RICO', ' ', 'g'), '\yINC\y', ' ', 'g'), '\yLLC\y', ' ', 'g'), '[^A-Z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'))) AS normalized_account,
    coalesce(nullif(regexp_replace(coalesce(pi.account_mask, ''), '\D', '', 'g'), ''), 'unknown-mask') AS normalized_mask,
    upper(trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(upper(coalesce(pi.account_type, 'UNKNOWN')), '\yPR\y', ' ', 'g'), 'PUERTO RICO', ' ', 'g'), '\yINC\y', ' ', 'g'), '\yLLC\y', ' ', 'g'), '[^A-Z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'))) AS normalized_type,
    upper(trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(upper(coalesce(pi.account_subtype, 'UNKNOWN')), '\yPR\y', ' ', 'g'), 'PUERTO RICO', ' ', 'g'), '\yINC\y', ' ', 'g'), '\yLLC\y', ' ', 'g'), '[^A-Z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'))) AS normalized_subtype
  FROM public.quick_entries qe
  JOIN public.plaid_imports pi
    ON pi.plaid_transaction_id = qe.plaid_transaction_id
   AND pi.user_id = qe.user_id
  LEFT JOIN public.plaid_accounts pa
    ON pa.plaid_account_id = pi.plaid_account_id
   AND pa.user_id = qe.user_id
  LEFT JOIN public.plaid_connections pc
    ON pc.id = pa.connection_id
   AND pc.user_id = qe.user_id
  WHERE qe.entry_date >= DATE '2026-06-01'
    AND qe.entry_date < DATE '2026-07-01'
    AND qe.amount > 0
    AND qe.source = 'plaid'
    AND pi.institution_name = 'Banco Popular Puerto Rico'
),
fingerprinted AS (
  SELECT
    *,
    concat_ws(
      '|',
      'confirmed-ledger-v1',
      normalized_description,
      entry_date::text,
      round(abs(amount) * 100)::text,
      concat_ws(
        ':',
        normalized_institution,
        normalized_account,
        normalized_mask,
        normalized_type,
        normalized_subtype
      )
    ) AS fingerprint
  FROM ledger_rows
),
group_stats AS (
  SELECT
    f.fingerprint,
    count(*) AS row_count,
    count(DISTINCT f.user_id) AS user_count,
    count(DISTINCT f.entry_date) AS date_count,
    count(DISTINCT round(abs(f.amount), 2)) AS amount_count,
    count(DISTINCT f.normalized_description) AS description_count,
    count(DISTINCT f.normalized_institution) AS institution_count,
    count(DISTINCT concat_ws(
      '|',
      f.normalized_account,
      f.normalized_mask,
      f.normalized_type,
      f.normalized_subtype
    )) AS account_identity_count,
    count(DISTINCT f.plaid_account_id) AS plaid_account_generations,
    count(DISTINCT f.connection_id) AS connection_generations,
    bool_or(cdr.id IS NOT NULL AND cdr.status = 'active') AS has_active_resolution
  FROM fingerprinted f
  LEFT JOIN public.confirmed_ledger_duplicate_resolutions cdr
    ON cdr.duplicate_quick_entry_id = f.quick_entry_id
   AND cdr.status = 'active'
  GROUP BY f.fingerprint
  HAVING count(*) > 1
),
ranked AS (
  SELECT
    f.*,
    gs.row_count,
    row_number() OVER (
      PARTITION BY f.fingerprint
      ORDER BY
        CASE WHEN f.connection_status = 'active' THEN 0 ELSE 1 END,
        f.connection_created_at DESC NULLS LAST,
        f.quick_entry_created_at ASC,
        f.quick_entry_id
    ) AS survivor_rank
  FROM fingerprinted f
  JOIN group_stats gs
    ON gs.fingerprint = f.fingerprint
  WHERE gs.user_count = 1
    AND gs.date_count = 1
    AND gs.amount_count = 1
    AND gs.description_count = 1
    AND gs.institution_count = 1
    AND gs.account_identity_count = 1
    AND gs.plaid_account_generations > 1
    AND gs.connection_generations > 1
    AND gs.row_count = gs.connection_generations
    AND gs.has_active_resolution = false
),
resolution_pairs AS (
  SELECT
    d.user_id,
    d.quick_entry_id AS duplicate_quick_entry_id,
    s.quick_entry_id AS survivor_quick_entry_id,
    d.fingerprint,
    d.amount,
    d.entry_date,
    d.description,
    d.category,
    d.plaid_import_id AS duplicate_plaid_import_id,
    s.plaid_import_id AS survivor_plaid_import_id,
    d.plaid_transaction_id AS duplicate_plaid_transaction_id,
    s.plaid_transaction_id AS survivor_plaid_transaction_id,
    d.plaid_account_id AS duplicate_plaid_account_id,
    s.plaid_account_id AS survivor_plaid_account_id,
    d.connection_id AS duplicate_connection_id,
    s.connection_id AS survivor_connection_id,
    d.connection_status AS duplicate_connection_status,
    s.connection_status AS survivor_connection_status,
    d.connection_created_at AS duplicate_connection_created_at,
    s.connection_created_at AS survivor_connection_created_at,
    d.quick_entry_created_at AS duplicate_quick_entry_created_at,
    s.quick_entry_created_at AS survivor_quick_entry_created_at
  FROM ranked d
  JOIN ranked s
    ON s.fingerprint = d.fingerprint
   AND s.survivor_rank = 1
  WHERE d.survivor_rank > 1
),
inserted AS (
  INSERT INTO public.confirmed_ledger_duplicate_resolutions (
    user_id,
    duplicate_quick_entry_id,
    survivor_quick_entry_id,
    resolution_type,
    reason,
    fingerprint,
    resolved_by,
    source_connection_ids,
    metadata
  )
  SELECT
    user_id,
    duplicate_quick_entry_id,
    survivor_quick_entry_id,
    'exact_duplicate',
    'Bulk June 2026 Banco Popular exact duplicate resolution. Same normalized merchant/date/amount/institution/account identity across distinct Plaid connection generations; original quick_entries preserved.',
    fingerprint,
    user_id,
    array_remove(ARRAY[duplicate_connection_id, survivor_connection_id], NULL),
    jsonb_build_object(
      'source', 'scripts/confirmed-ledger-duplicate-resolution-june-2026-insert.sql',
      'scope', 'June 2026 Banco Popular proven duplicate groups',
      'safety_checks', jsonb_build_array(
        'same_user',
        'same_transaction_date',
        'same_absolute_amount',
        'same_normalized_description',
        'same_institution',
        'same_resolved_account_identity',
        'different_plaid_connection_generation',
        'one_row_per_connection_generation',
        'no_active_resolution_before_insert'
      ),
      'survivor_selection', 'Prefer active/current Plaid connection, then newest connection generation, then earliest confirmed quick_entry.',
      'duplicate', jsonb_build_object(
        'quick_entry_id', duplicate_quick_entry_id,
        'plaid_import_id', duplicate_plaid_import_id,
        'plaid_transaction_id', duplicate_plaid_transaction_id,
        'plaid_account_id', duplicate_plaid_account_id,
        'connection_id', duplicate_connection_id,
        'connection_status', duplicate_connection_status,
        'connection_created_at', duplicate_connection_created_at,
        'quick_entry_created_at', duplicate_quick_entry_created_at,
        'entry_date', entry_date,
        'description', description,
        'category', category,
        'amount', amount
      ),
      'survivor', jsonb_build_object(
        'quick_entry_id', survivor_quick_entry_id,
        'plaid_import_id', survivor_plaid_import_id,
        'plaid_transaction_id', survivor_plaid_transaction_id,
        'plaid_account_id', survivor_plaid_account_id,
        'connection_id', survivor_connection_id,
        'connection_status', survivor_connection_status,
        'connection_created_at', survivor_connection_created_at,
        'quick_entry_created_at', survivor_quick_entry_created_at
      )
    )
  FROM resolution_pairs
  ON CONFLICT DO NOTHING
  RETURNING
    id,
    user_id,
    duplicate_quick_entry_id,
    survivor_quick_entry_id,
    fingerprint,
    resolved_at
)
SELECT
  (SELECT count(DISTINCT fingerprint) FROM resolution_pairs) AS selected_groups,
  (SELECT count(*) FROM resolution_pairs) AS selected_duplicate_rows,
  count(*) AS inserted_resolution_rows,
  (SELECT coalesce(sum(amount), 0) FROM resolution_pairs) AS selected_duplicate_amount,
  jsonb_agg(
    jsonb_build_object(
      'resolution_id', id,
      'duplicate_quick_entry_id', duplicate_quick_entry_id,
      'survivor_quick_entry_id', survivor_quick_entry_id,
      'fingerprint', fingerprint,
      'resolved_at', resolved_at
    )
    ORDER BY resolved_at, duplicate_quick_entry_id
  ) AS inserted_rows
FROM inserted;

-- Optional read-back validation after execution:
--
-- SELECT
--   count(*) AS active_resolution_rows,
--   count(DISTINCT fingerprint) AS resolved_groups,
--   min(resolved_at) AS first_resolved_at,
--   max(resolved_at) AS last_resolved_at
-- FROM public.confirmed_ledger_duplicate_resolutions
-- WHERE status = 'active'
--   AND metadata->>'source' =
--     'scripts/confirmed-ledger-duplicate-resolution-june-2026-insert.sql';
--
-- SELECT
--   cdr.duplicate_quick_entry_id,
--   cdr.survivor_quick_entry_id,
--   qe.description,
--   qe.entry_date,
--   qe.amount,
--   qe.category,
--   cdr.fingerprint,
--   cdr.resolved_at
-- FROM public.confirmed_ledger_duplicate_resolutions cdr
-- JOIN public.quick_entries qe
--   ON qe.id = cdr.duplicate_quick_entry_id
-- WHERE cdr.status = 'active'
--   AND cdr.metadata->>'source' =
--     'scripts/confirmed-ledger-duplicate-resolution-june-2026-insert.sql'
-- ORDER BY qe.entry_date, qe.amount, qe.description, cdr.duplicate_quick_entry_id;
