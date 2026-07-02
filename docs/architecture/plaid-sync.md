# Plaid Sync Flow

Last updated: 2026-07-02

## Purpose

Plaid sync brings connected bank/card facts into Mansor One without bypassing Review Queue.

Plaid is an integration source. It is not the confirmed ledger and it is not the final financial meaning of a transaction.

## Current Flow

### Sync Accounts

`/api/plaid/sync-accounts`:

- requires authenticated user
- loads only the user's Plaid connections
- calls Plaid account/balance APIs
- upserts `plaid_accounts`
- updates connected balances and account metadata
- does not write manual card profiles
- does not write ledger rows

### Sync Transactions

`/api/plaid/sync-imports`:

- requires authenticated user
- loads only the user's Plaid connections
- reads current `plaid_accounts` for account context
- calls Plaid transaction sync
- upserts `plaid_imports`
- preserves existing `imported = true`
- backfills missing account context from `plaid_accounts`
- marks imports as already imported when same-user `quick_entries.plaid_transaction_id` already exists
- does not create ledger rows

### Sync Now

The `/plaid` UI runs account sync first, then transaction sync.

This keeps account context fresher before new transaction candidates are created.

## Review Queue Boundary

Plaid imports remain candidates until reviewed.

Confirmed history should enter `quick_entries` through Review Queue confirmation or the shared promotion helper.

Spending, History and confirmed Dashboard movement lists should use confirmed ledger entries, not raw Plaid imports.

## Result Wording

Sync results should distinguish:

- transactions returned by Plaid
- new imports created
- pending imports for Review Queue
- already-confirmed imports cleaned
- account context backfilled
- failed connections

This avoids implying that every Plaid-returned transaction is a new user-visible movement.

## Future Work

- Persist Plaid transaction sync cursor per connection.
- Consider uniqueness on `(user_id, plaid_transaction_id)`.
- Store last sync status/timestamp explicitly instead of deriving it from account `updated_at` or newest transaction date.
- Backfill account masks when Plaid provides them.
- Keep service-role usage server-only and always scoped to authenticated `user.id`.
