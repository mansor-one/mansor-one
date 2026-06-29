# Financial Reconciliation Engine

Last updated: 2026-06-28

## Purpose

Financial Reconciliation Engine v1 proposes possible matches between recent transactions/imports and open `payment_instances`.

This version is read-only. It does not mark payments as paid, confirmed, reconciled, or ignored. It does not write to `quick_entries`, `plaid_imports`, `payment_instances`, `transaction_suggestions`, or any future reconciliation table.

## Inputs

The temporary dev page `/dev/reconciliation` reads:

- recent `plaid_imports`
- recent `quick_entries`
- current-month `payment_instances` with status `pending` or `initiated`

`plaid_imports` and `quick_entries` are read for the authenticated user. `payment_instances` is still a legacy table without `user_id`, so v1 follows the current payment engine pattern until that table is migrated.

## Matching Rules

Amount similarity:

- exact match is strong
- within $1 is medium
- within 5% is weak

Date window:

- transaction date should be within 10 days before or after the payment due date
- initiated payments can use `updated_at` and notes as context

Name similarity:

- direct payment name match is strong
- aliases improve confidence
- generic ATM/POS rows lower confidence

Known aliases:

- `LUMA`, `Luz`, utility/electricity
- `Agua`, `AAA`, `PRASA`
- `Synchrony`, credit card payment, `EFT PMT`, `CARDMEMBER`, `U.S. BANK`
- `Lares`, `COOP LARES`

Status behavior:

- `pending` payment matches are possible confirmations
- `initiated` payment matches are likely confirmations

## Confidence Levels

- 90+ high confidence
- 70-89 likely
- 50-69 possible
- under 50 low confidence/debug only

## Output

Each proposed match includes:

- transaction source
- transaction id
- transaction name
- transaction amount
- transaction date
- payment instance id
- payment name
- payment amount
- payment status
- confidence
- confidence level
- reasons
- recommended action text

## Future Write Behavior

Future reconciliation can add explicit write flows after review:

- confirm a proposed match
- mark a payment as confirmed
- link the transaction to a payment instance
- preserve an audit trail
- reverse or reject a bad match

This should not be automatic until confidence, review UX, RLS, and data ownership are solid.

## Relationship to Other Engines

Financial Identity Engine helps classify transaction names as merchants, transfers, card payments, fees, interest, income, or unknown.

Merchant Knowledge helps understand repeated merchant behavior.

Payment Lifecycle defines whether a payment is pending, initiated, or confirmed.

Financial Reconciliation uses those signals to propose matches, but it does not own payment status or ledger truth.
