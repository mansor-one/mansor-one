# Testing Guide

## Automated baseline

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected checkpoint baseline: all tests and production build pass. ESLint may report the six documented unused-code warnings in `ReviewQueueClient.tsx`, but no errors.

## Manual end-to-end regression

Use an authenticated non-production test household where possible. Record IDs and screenshots only in the test run, not in durable architecture documents.

### 1. Sync an account

- Open Banks/Plaid and run account sync.
- Confirm active balances update without creating duplicate `plaid_accounts`.
- Confirm credit liability sync reports unavailable institutions separately rather than failing balance sync.

### 2. Import a transaction

- Run Plaid transaction sync/import twice.
- Confirm the second run updates the same source transaction.
- If a posted transaction replaces pending, confirm the pending row becomes superseded and only posted is eligible downstream.

### 3. Review Walmart

- Open Financial Inbox/Review Queue and select the Walmart transaction.
- Confirm merchant, amount, date, payment method, transaction type, canonical category, owner, goal/fund, and note are visible.

### 4. Associate Back to School fund

- Select “Goal or family event.”
- Keep category “School Supplies.”
- Select “Back to School 2026” and save.
- Confirm one `quick_entries` row and one `planning_item_transactions` relationship exist.
- Confirm the Review Queue item disappears and the fund `spent_amount` increases once.

### 5. Confirm an obligation payment

- Open Timeline, select Honda Soraya, and verify the drawer shows contractual due date, grace deadline, amount, loan context, status, and missing fields.
- Choose an eligible account such as FirstBank Cuenta Perfecta rather than typing its name.
- Save “Sí, ya pagué esto.”

### 6. Pending settlement

- Confirm the obligation displays “Pagado, esperando confirmación.”
- Confirm a pending-settlement link stores account ID/source and human-readable method.
- Confirm the obligation is excluded from Financial Health unpaid risk and from duplicate Cash Flow subtraction.

### 7. Reconciliation

- Sync the matching posted transaction.
- Confirm one unique match at 90% or higher becomes reconciled.
- Confirm the permanent obligation-to-transaction link and reconciliation event exist.
- Verify ambiguous or low-confidence candidates remain open.

### 8. Dashboard update

- Confirm open obligations, pending settlement, reconciled recently, confirmed spending, and Financial Health explanations match their drill-down datasets.

### 9. Cash Flow update

- Confirm the reconciled payment is not subtracted again.
- Confirm unpaid commitments use the same effective grace deadline as Timeline and Financial Health.

### 10. Timeline update

- Confirm the reconciled lifecycle badge appears.
- Confirm closing the drawer preserves month, view, filters, and scroll position.
- Confirm grace appears once at its deadline rather than as repeated obligations.

### 11. Portfolio card authority

- Verify connected balance and available credit come from Plaid.
- Verify minimum-payment source follows Plaid Liabilities, manual card, schedule, then Timeline occurrence.
- Verify linked manual/Plaid card representations count once.

### 12. Retirement liquidity exclusion

- Verify Retiro remains in Assets and Net Worth.
- Verify it does not contribute to Available Today, Financial Health cash, or the payment-account selector unless explicitly configured spendable.

## Failure handling

- Do not repair data by deleting source rows.
- Capture the source IDs, lifecycle states, calculation filters, and reconciliation evidence.
- Re-run idempotent sync/promotion once to distinguish transient failure from duplicate creation.
- Use Repair Center or a reviewed migration for corrections.
