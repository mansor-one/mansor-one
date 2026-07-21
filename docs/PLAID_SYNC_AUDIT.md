# Plaid sync audit

## Previous user-facing actions

1. `Sync accounts` called `/api/plaid/sync-accounts`. It refreshed account balances and then requested credit liabilities for each connection.
2. `Sync transactions` called the accounts endpoint first and `/api/plaid/sync-imports` second. Transaction sync upserts by `plaid_transaction_id`, advances the cursor, handles pending/posted replacement, and then runs obligation reconciliation.
3. `Sync now` called the same client handler as `Sync transactions`; it was a duplicate control rather than a separate operation.

## Dependencies and decision

- Accounts must precede liabilities so liability rows can update a known `plaid_account_id`.
- Account context must exist before transaction imports are enriched.
- Reconciliation must run after posted transactions are persisted.
- Financial Engine summaries are computed from canonical sources and are recalculated after reconciliation; they are not copied into another financial-history table.
- The operations remain separate idempotent services and are orchestrated in a fixed order. They are not merged into one opaque write operation, so partial completion and retry remain observable.

## Income reconciliation limitation

The current architecture has projected income schedules but no authoritative transaction-to-income-schedule relationship. The orchestration step evaluates the current income schedules and reports this limitation as a warning; it does not fabricate income reconciliation links.
