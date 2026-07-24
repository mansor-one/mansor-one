-- Reviewable, idempotent resolution for three Plaid-verified July 2026 pairs.
-- No quick_entries or plaid_imports rows are deleted or updated.

with verified_pairs(
  pending_plaid_transaction_id,
  posted_plaid_transaction_id,
  merchant
) as (
  values
    ('ZAYnwre5B9iPJgY1eNyAUN4PNLebJgUpjr8pn', 'YkYndA9QP3IR1qdDrB6XfNovP8M9xMUJeKkaD', 'Caprese LLC'),
    ('3yDB5zxVjgtQNrMwzeDgt6vXpmA9nJtoKBXYE', 'axYLBQ158PS7JxaknywjF0LDBKvKDQta0N6Rd', 'McDonald''s'),
    ('yBy8YV3kgms05dky6g3rIQj16ozyewFpOxwkn', 'xq37YZJKoRhJBOb3a49Ec6Z8qwJw8PHj7PdYz', 'Parking San Jorge')
),
resolved_pairs as (
  select
    pending_entry.user_id,
    pending_entry.id as duplicate_quick_entry_id,
    posted_entry.id as survivor_quick_entry_id,
    verified_pairs.*
  from verified_pairs
  join public.quick_entries pending_entry
    on pending_entry.plaid_transaction_id = verified_pairs.pending_plaid_transaction_id
  join public.quick_entries posted_entry
    on posted_entry.plaid_transaction_id = verified_pairs.posted_plaid_transaction_id
   and posted_entry.user_id = pending_entry.user_id
)
insert into public.confirmed_ledger_duplicate_resolutions (
  user_id,
  duplicate_quick_entry_id,
  survivor_quick_entry_id,
  resolution_type,
  reason,
  fingerprint,
  metadata
)
select
  resolved_pairs.user_id,
  resolved_pairs.duplicate_quick_entry_id,
  resolved_pairs.survivor_quick_entry_id,
  'exact_duplicate',
  format(
    'Plaid posted transaction %s explicitly references pending transaction %s.',
    resolved_pairs.posted_plaid_transaction_id,
    resolved_pairs.pending_plaid_transaction_id
  ),
  format(
    'plaid-pending-posted:%s:%s',
    resolved_pairs.pending_plaid_transaction_id,
    resolved_pairs.posted_plaid_transaction_id
  ),
  jsonb_build_object(
    'source', 'plaid_pending_transaction_id',
    'merchant', resolved_pairs.merchant,
    'pending_transaction_id', resolved_pairs.pending_plaid_transaction_id,
    'posted_transaction_id', resolved_pairs.posted_plaid_transaction_id
  )
from resolved_pairs
where not exists (
  select 1
  from public.confirmed_ledger_duplicate_resolutions existing
  where existing.user_id = resolved_pairs.user_id
    and existing.duplicate_quick_entry_id = resolved_pairs.duplicate_quick_entry_id
    and existing.status = 'active'
    and existing.resolution_type in ('exact_duplicate', 'user_confirmed_duplicate')
);

select
  verified_pairs.merchant,
  pending_entry.id as excluded_pending_quick_entry_id,
  posted_entry.id as retained_posted_quick_entry_id,
  posted_entry.amount as counted_amount
from (
  values
    ('ZAYnwre5B9iPJgY1eNyAUN4PNLebJgUpjr8pn', 'YkYndA9QP3IR1qdDrB6XfNovP8M9xMUJeKkaD', 'Caprese LLC'),
    ('3yDB5zxVjgtQNrMwzeDgt6vXpmA9nJtoKBXYE', 'axYLBQ158PS7JxaknywjF0LDBKvKDQta0N6Rd', 'McDonald''s'),
    ('yBy8YV3kgms05dky6g3rIQj16ozyewFpOxwkn', 'xq37YZJKoRhJBOb3a49Ec6Z8qwJw8PHj7PdYz', 'Parking San Jorge')
) as verified_pairs(pending_id, posted_id, merchant)
join public.quick_entries pending_entry
  on pending_entry.plaid_transaction_id = verified_pairs.pending_id
join public.quick_entries posted_entry
  on posted_entry.plaid_transaction_id = verified_pairs.posted_id
 and posted_entry.user_id = pending_entry.user_id
order by verified_pairs.merchant;
