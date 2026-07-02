# Payment Lifecycle

Last updated: 2026-07-02

## Purpose

Payment Lifecycle v2 prepares Mansor One for consistent payment status across Dashboard, Cards, Timeline, Planning preview and Robototina.

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

Review Queue promotion can create confirmed `quick_entries` from Plaid imports. Payment confirmation routes can explicitly close matching payment instances. Pages should consume shared lifecycle output instead of interpreting raw `payment_instances` independently.

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

## V2 Shared Lifecycle Rules

One shared lifecycle view should decide payment state for Dashboard, Cards, Robototina, Timeline and Planning preview.

Rules:

- A cycle is closed when status is `paid`, `confirmed` or `closed`.
- A cycle is also closed when a confirmed ledger movement matches the expected payment.
- If the current cycle is closed, the next due date should advance to the next expected cycle.
- Overdue means the effective due date is before today and the cycle is not closed.
- Grace period affects effective due date.
- Missing last payment alone must not make a future due date overdue.
- Timeline and Planning preview should not use raw `payment_instances` as final truth.
- Robototina should use the same lifecycle output as Dashboard and Cards.

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

Manual payment linking still needs a durable model and audit trail.

Toyota/Honda obligations and grace-period configuration should be modeled through the Financial Engine, not page logic.

No existing payment rows were modified.
