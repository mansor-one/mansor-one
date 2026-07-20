# Plaid Pending/Posted Duplicate Audit

Last updated: 2026-07-19

## Findings before implementation

1. `app/api/plaid/sync-imports/route.ts` called `/transactions/sync` without a stored cursor and consumed only `response.data.added`. It ignored `modified`, `removed`, `has_more`, and `next_cursor`.
2. Sync upserted `plaid_imports` by `plaid_transaction_id`, so rerunning the same ID was idempotent. A pending transaction and its later posted replacement have different IDs, however, so both were inserted.
3. `plaid_imports` did not persist Plaid's `pending` or `pending_transaction_id`. It also had no lifecycle state for active, pending, superseded, removed, rejected, or duplicate rows.
4. Removed/replaced pending rows remained active and promotable. The sync did not mark them removed or superseded.
5. Spending reads `getLedgerSummary().confirmedLedgerEntries`, which is built from `quick_entries`. It excluded user-resolved confirmed-ledger duplicates, but did not inspect the linked Plaid import lifecycle. Pending, superseded, or removed source rows therefore remained in confirmed spending after promotion.
6. Review Queue promotion protects against an identical `plaid_transaction_id`, but cannot recognize a posted transaction replacing a different pending ID without `pending_transaction_id`.
7. ATH/Gmail rows are not directly included in Spending. Manual and CSV-style `quick_entries` can still form possible duplicates, but without a stable Plaid source link they must remain review candidates rather than being automatically merged.

## Live July 2026 evidence

All six rows are on the same Chase credit account and each Plaid import was promoted to its own `quick_entries` row:

| Merchant | Earlier ID/date | Later ID/date | Current counted total |
| --- | --- | --- | ---: |
| Caprese LLC | `ZAYnw...` / 2026-07-07 | `YkYnd...` / 2026-07-08 | $34.22 |
| McDonald's | `3yDB5...` / 2026-07-08 | `axYLB...` / 2026-07-10 | $33.14 |
| Parking San Jorge | `yBy8Y...` / 2026-07-08 | `xq37Y...` / 2026-07-10 | $9.00 |

Current combined total: **$76.36**. Expected after reliable pending-to-posted supersession: **$38.18**.

A read-only Plaid verification confirmed all three direct links:

- `YkYnd...` (Caprese posted) references `ZAYnw...` (pending).
- `axYLB...` (McDonald's posted) references `3yDB5...` (pending).
- `xq37Y...` (Parking posted) references `yBy8Y...` (pending).

These three cases are therefore safe exact source-linked replacements, not heuristic merges.

## Required narrow schema addition

Plaid documents that a posted transaction can reference its predecessor through `pending_transaction_id`, while the predecessor appears in the sync `removed` list. Reliable handling therefore requires storing:

- pending flag and pending source ID
- transaction lifecycle status
- replacement/supersession source ID and timestamp
- removal timestamp
- per-connection `/transactions/sync` cursor

These are additive lifecycle fields only. Financial history remains present; no transaction or ledger row is deleted.

Deployment note: the available service credential cannot execute schema SQL or insert owner-scoped resolution events. The migration and the idempotent July resolution script must be applied through an authorized Supabase migration/SQL session.

## Target behavior

- Consume every sync page and persist the final cursor.
- Upsert added and modified rows by stable Plaid transaction ID.
- Mark a pending predecessor `superseded` when a posted row references it.
- Mark other removed rows `removed`.
- Exclude pending, superseded, removed, rejected, and duplicate Plaid-backed ledger rows from confirmed spending.
- Keep same-merchant/amount posted rows without reliable source linkage visible as possible duplicates for review.
- Report replacement, exact-ID, possible-duplicate, and spending-exclusion diagnostics.
