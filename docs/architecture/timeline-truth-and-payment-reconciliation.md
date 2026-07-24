# Timeline Truth and Payment Reconciliation

Last updated: 2026-07-19

## Technical audit

### Current data flow before this sprint

| Result | Source |
| --- | --- |
| Dashboard open-payment metric | `getDashboardSummary()` -> `getLiquiditySummary()` -> synthesized lifecycle items from `payment_instances`, `scheduled_payments`, and `obligation_instances` |
| Timeline payment events | `getTimelineProjection()` -> Dashboard liquidity -> every lifecycle item whose lifecycle was open |
| Initial available cash | Portfolio `totalLiquidAvailable`, split into connected and spendable manual cash |
| Loaded open commitments | Current-month `payment_instances`, generated current/next `scheduled_payments` occurrences, plus obligation instances |
| Loaded income | Active `income_schedule` rows whose single `next_expected_date` was present and not in the past |
| Final projected balance | Initial usable cash plus loaded income minus every open lifecycle payment, with no active horizon |

### Root causes

1. Income showed `$0.00` and zero events when active schedules had missing/stale `next_expected_date` values. The engine did not expand weekly, biweekly, or monthly cadence into occurrences.
2. Old July commitments remained open because raw `pending`/`initiated` rows were treated as payable until explicitly closed. Transaction candidates were advisory and did not consistently affect projection truth.
3. The August 2027 insurance item affected the low point because Timeline had no date horizon.
4. Recurring templates and instances were partly separated: schedules generated occurrences and obligation instances had a unique cycle index, but the projection contract did not explicitly reject template/instance duplicates.
5. Reconciliation already existed in `lib/financial-engine/reconciliation.ts`; ledger promotion and Review Queue already existed, while `reconcileMovement()` was an unsafe legacy write path that could mark a row paid from amount/name alone.
6. `obligation_payment_links` already provides a durable owner-scoped link model, and `obligation_instances_unique_cycle` prevents duplicate active obligation occurrences. No new schema was necessary.

Live audit note: service-role reads for legacy payment, schedule, obligation, and income tables returned `permission denied`; transaction tables were readable. Exact row-by-row classification therefore requires an authenticated application session after deployment.

## Implementation plan and result

1. Define one pure payment-truth resolver with explicit statuses and reasons.
2. Treat only a unique `quick_entries` candidate at confidence 70 or higher as matched. Plaid import candidates and ambiguous confirmed-ledger candidates remain `possible_match`.
3. Exclude zero/missing, duplicate, paid/matched, rejected/cancelled, and future items from projection subtraction.
4. Generate expected income instances from each schedule's configured cadence and anchor date.
5. Default Dashboard and Timeline to 45 days, with 30/45/90/full-year filters.
6. Group Timeline into Needs attention, Upcoming, Possible matches, Paid or reconciled, and Later.
7. Surface diagnostic counts and incomplete income metadata rather than silently presenting zero as trusted truth.

## Canonical source-of-truth rules

- `obligations` and `scheduled_payments` are recurring definitions/templates, never additional payable events.
- `obligation_instances` and `payment_instances` are dated occurrences.
- A closed occurrence is paid only through explicit status or a durable confirmed link.
- `quick_entries` is the confirmed ledger. A unique high-enough match can close projection pressure without rewriting the payment row.
- Unpromoted `plaid_imports` can propose a possible match only.
- Exact amount alone cannot produce a match; reconciliation requires merchant/identity, institution/account, or another non-amount signal.
- A transaction proposed for more than one payment is ambiguous and cannot automatically match either payment.
- Possible matches remain visible and are not subtracted from cash as if certainly unpaid or treated as certainly paid.
- Projection is: usable cash + expected income occurrences - open complete nonduplicate payments inside the selected horizon.

## Status definitions

- `paid`: explicitly closed manually.
- `matched`: uniquely matched to the confirmed ledger.
- `possible_match`: a likely or ambiguous transaction needs confirmation.
- `unpaid`: complete and open inside the horizon, but not due soon.
- `due_soon`: due within seven days.
- `due_today`: due today.
- `grace_period`: normal due date passed but grace has not.
- `overdue`: due/grace date passed with no confirmed payment.
- `needs_review`: duplicate or conflicting data.
- `incomplete`: amount is zero/invalid or due date is missing.
- `future`: outside the active horizon.

## Reconciliation workflow

The Timeline sends uncertain candidates to the existing Review Queue. Manual paid/reopen actions must use the unified lifecycle/card flow until legacy payment tables gain owner-safe write authorization. The legacy `reconcileMovement()` auto-write behavior is not used as payment truth.

## Remaining manual data gaps

- Complete/refresh `next_expected_date`, amount, owner, cadence, and destination account for Manuel and Soraya income schedules.
- Confirm old July payment matches in an authenticated Review Queue session.
- Resolve Chase `$0.00` instead of treating it as a payable amount.
- Confirm unusually low utility amounts and duplicate instances.
- Verify the Synchrony candidate and Honda/Toyota grace configuration against the authenticated records.

## Validation expectations

Authenticated validation must capture each loaded July/August 2026 occurrence and its reason: explicit paid status, unique confirmed-ledger match, possible match, open timing status, incomplete data, duplicate, or outside-horizon exclusion. August 2027 insurance must be `future` for 30/45/90-day views.
