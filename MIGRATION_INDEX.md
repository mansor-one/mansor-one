# Migration Index — July 2026 Financial Foundation

Production status was verified against Supabase migration history on 2026-07-20.

| Migration | Purpose | Affected objects | Rollback considerations | Production |
|---|---|---|---|---|
| `20260719_plaid_transaction_lifecycle_v1.sql` | Persist pending/posted replacement, removal, and sync cursor/error state | `plaid_imports`, `plaid_connections`, lifecycle indexes/check | Preserve lifecycle columns until all readers stop using them; dropping indexes is safe only after query review | Applied |
| `20260719_review_queue_transaction_goal_relationship_v1.sql` | Atomically confirm a reviewed transaction and associate it with a planning fund | `planning_items`, `planning_item_transactions`, `quick_entries`, `plaid_imports`, `confirm_review_transaction()` | Do not decrement `spent_amount` without reconciling relationship rows; retain promoted quick entries | Applied |
| `20260720_smart_obligation_reconciliation.sql` | Add reconciliation lifecycle, idempotency constraints, and audit events | `obligation_payment_links`, `obligation_reconciliation_events`, indexes, RLS policies | Event history should be exported before removal; uniqueness constraints protect against double reconciliation | Applied |
| `20260720_backfill_reconciled_obligation_links.sql` | Align legacy link status with already confirmed obligation instances | `obligation_payment_links` | Data backfill is not mechanically reversible; use audit/link timestamps for targeted correction | Applied |
| `20260720_plaid_account_spendability.sql` | Separate asset ownership from usable-cash eligibility | `plaid_accounts.is_spendable` | Removing the column would make investment liquidity ambiguous; default false is intentionally conservative | Applied |
| `20260720_credit_card_authority_mapping.sql` | Store Plaid liability fields and link uniquely matched manual cards, Plaid accounts, and schedules | `plaid_accounts`, `credit_cards`, `scheduled_payments` | Do not delete linked rows; unlink only reviewed mappings. Liability fields are nullable and can be ignored by older code | Applied |
| `20260720_obligation_payment_account_reference.sql` | Store structured payment-account references while preserving legacy labels | `obligation_payment_links` | Columns are nullable; rollback can drop them after exporting structured references. Historical `payment_method` remains intact | Applied |

Earlier prerequisite migrations remain indexed by filename under [`migrations/`](./migrations/), including planning-fund movement ledger, duplicate-resolution events, confirmed-ledger duplicate resolutions, Portfolio management, and base obligation schemas.
