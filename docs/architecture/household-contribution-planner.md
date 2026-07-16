# Household Contribution Planner v1

## Purpose

The Household Contribution Planner answers how much Manuel and Soraya should
separate from incoming money to cover near-term household obligations.

It is a read-only Financial Engine feature. It recommends contribution amounts,
covered payments, transfer needs and remaining available money. It does not move
money, create transfers, mark bills paid, update balances or allocate Planning
funds.

## Source Boundaries

- Financial Engine Snapshot is the input boundary.
- Portfolio owns usable household cash and account inclusion.
- Liquidity owns income timing and payment lifecycle timing.
- Lifecycle Payments own due, grace, overdue and open/closed state.
- Planning owns non-critical funds and future planning pressure.
- React presents the plan and may pass temporary scenario inputs through query
  parameters for review.

The planner must not query financial tables from React and must not duplicate
Portfolio cash, Timeline projection or Payment Lifecycle calculations.

## Allocation Scenarios

The planner returns three comparison scenarios:

1. Responsibility-based
   Personal obligations are assigned to the labeled owner. Shared or unknown
   obligations are split evenly.

2. Proportional-income
   Required payments are split according to each person's share of income inside
   the selected horizon.

3. Hybrid
   Personal obligations are assigned first. Shared or unknown obligations are
   split proportionally by income. If one person lacks enough income, the other
   person's remaining income may be shown as optional household support.

Hybrid is recommended only when both payment ownership and income ownership
signals exist. If the data is incomplete, the planner still shows the scenario
but lowers confidence through warnings.

## Ownership vs Responsibility

The planner distinguishes:

- legal or account owner from the source data,
- household responsibility for shared or unknown obligations,
- recommended contribution from a specific income event,
- optional support when one person lacks enough income.

It must not assume Soraya should pay a debt only because it is in Manuel's name,
or the reverse. Weak ownership metadata is reported as a warning.

## Windfall Handling

Windfalls and one-time income such as tax relief, severance, bonuses and
reimbursements are not automatically treated as extra debt money.

The planner reserves in this order:

1. overdue obligations,
2. near-term required payments,
3. minimum credit-card payments,
4. essential household obligations,
5. protected cash,
6. safe extra debt review amount,
7. Planning funds.

In v1, protected cash is a conservative planner assumption rather than a stored
household policy. Future versions should make the reserve target explicit and
user-configurable.

## Missing Data Behavior

The planner does not invent missing values. If income ownership, payment
ownership, minimum payment, due date, grace metadata or confidence is weak, the
plan includes warnings and may leave amounts uncovered.

Unknown-owner payments are treated as shared household responsibility for v1,
but the warning remains visible so the data can be repaired.

## Dev Surface

The read-only internal page is:

- `/dev/household-contributions`

It supports:

- 7, 14 and 30 day horizons,
- scenario comparison,
- temporary Manuel income,
- temporary Soraya income,
- temporary one-time household windfall.

Temporary inputs live only in the URL/request and are not written to the
database.

## Future Workflow

Future versions may add:

- durable household responsibility fields,
- explicit bill-paying account selection,
- saved contribution plans,
- transfer draft generation,
- user-confirmed contribution events,
- Robototina explanations,
- Atlas simulations.

Those future workflows must preserve the v1 boundary: recommendations first,
explicit user confirmation before any money movement or persistent state change.
