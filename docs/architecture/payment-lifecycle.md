# Payment Lifecycle

Last updated: 2026-06-26

## Purpose

Payment Lifecycle v1 prepares Mansor One for future automatic reconciliation without changing today's payment behavior.

Today, `payment_instances` acts as the monthly obligation list. Pages and calculations mostly treat any status other than `paid` as open. Future reconciliation needs a clearer distinction between a payment that is merely planned, a payment that the user says was sent, and a payment that the bank or ledger confirms.

## Current Status Usage

### `payment_instances`

Current database values observed:

- `pending`
- `paid`

Current schema allows free-text `status`; there is no enum or check constraint for payment lifecycle states.

### Payment UI

`app/payment-instances/page.tsx` currently writes:

- `pending`: open payment.
- `promise`: compatibility state for a promised/intended payment.
- `paid`: manually marked as paid.

The UI totals use:

- pending/open total: `status !== 'paid'`
- paid total: `status === 'paid'`

### `reconcileMovement()`

`lib/finance/reconcileMovement.ts` currently:

- searches `payment_instances` where `status != 'paid'`
- matches by amount and description/name
- updates matched payments to `status = 'paid'`
- appends reconciliation information to `notes`

It does not track payment initiation, external confirmation, paid date, paid amount, partial payment, or arrears.

### APIs

Plaid import calls `reconcileMovement()` after inserting a `quick_entries` row. No API currently exposes a full payment lifecycle.

## Canonical Lifecycle States

Payment Lifecycle v1 defines these canonical states:

### `pending`

The payment is expected but no payment action has been recorded.

Examples:

- Synchrony card payment due soon.
- LUMA bill exists for the month but has not been paid.
- Mortgage payment is expected.
- Sunrun payment is expected.
- A subscription is expected.

### `initiated`

The user or system believes the payment was started, but Mansor One has not reconciled it against a confirmed ledger movement yet.

This state exists because many real payments have a delay between action and confirmation:

- User schedules a mortgage payment today, bank posts tomorrow.
- User pays LUMA, but Plaid has not imported the ACH/card transaction yet.
- A subscription charge is pending at the merchant.
- A card autopay was submitted but not posted.

`initiated` should reduce repeated user prompts without pretending the payment is confirmed.

### `confirmed`

The payment has been matched to a trusted source, such as:

- imported Plaid transaction
- confirmed manual ledger entry
- future payment ledger record

`confirmed` is the future canonical replacement for today's `paid` behavior.

## Compatibility States

These states still exist for compatibility:

- `promise`: current UI state meaning the user intends/promises to pay.
- `paid`: current closed state used by UI, Dashboard, Liquidity, Timeline and reconciliation.

Do not remove or reinterpret these until the schema and UI migrate.

## Future State Transitions

Recommended lifecycle:

1. `pending`
2. `initiated`
3. `confirmed`

Allowed compatibility paths:

- `pending` -> `paid`
- `promise` -> `paid`
- `paid` -> future migration to `confirmed`

Future reversal paths may be needed:

- `initiated` -> `pending` if payment was cancelled.
- `confirmed` -> `pending` only through correction/audit workflow.

## Future Reconciliation

Reconciliation should remain separate from lifecycle intent.

Lifecycle answers: what does Mansor One believe about the obligation?

Reconciliation answers: what ledger movement proves it?

Future reconciliation should match payment instances against:

- Plaid transactions
- manual `quick_entries`
- payment ledger rows
- merchant/account rules

It should eventually track:

- paid amount
- paid date
- source transaction
- confidence score
- partial payment
- remaining amount
- arrears/carryover

## Examples

### Synchrony

- `pending`: monthly payment is due.
- `initiated`: user scheduled payment from bank portal.
- `confirmed`: Plaid imports the matching Synchrony payment transaction.

### LUMA

- `pending`: LUMA bill is expected or current amount is known.
- `initiated`: user says payment was submitted.
- `confirmed`: ACH/card transaction posts and reconciles.

### Mortgage

- `pending`: mortgage obligation exists for the month.
- `initiated`: payment was scheduled before due date.
- `confirmed`: bank debit posts.

### Sunrun

- `pending`: solar payment is expected.
- `initiated`: autopay is expected to run or user confirms it ran.
- `confirmed`: transaction appears in Plaid/manual ledger.

### Subscriptions

- `pending`: subscription expected this cycle.
- `initiated`: merchant authorization appears but final posting is not confirmed.
- `confirmed`: final charge posts and matches.

## Rules For V1

- Do not count `initiated` as fully confirmed.
- Do not keep asking the user as aggressively for `initiated` payments.
- Do not mark `confirmed` without reconciliation or explicit user confirmation.
- Keep `paid` compatibility until migration.
- Keep reconciliation separate from user intent.

## Not Implemented Yet

No schema changes were made.

No UI behavior changed.

No Plaid reconciliation changes were implemented.

No existing payment rows were modified.
