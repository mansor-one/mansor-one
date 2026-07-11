# Debt Data Contract

Last updated: 2026-07-09

## Purpose

DebtSummary v1 defines the official normalized debt metadata contract for
Mansor One.

Debt in Mansor One currently spans several domains:

- Portfolio knows whether an account or liability belongs in the financial
  picture and owns balance, net worth and debt totals.
- Cards knows credit-card-specific metadata such as limits, utilization,
  minimum payments, APR fields, owners and missing-data warnings.
- Payment Lifecycle knows due status, grace periods, open cycles and payment
  timing.

Debt Strategy, Decision Engine, Robototina and future Atlas should not each
rebuild that composition independently. DebtSummary exists to make debt facts
boring, explicit and reusable before higher-level strategy begins.

Core rule:

- Financial Engine calculates.
- DebtSummary normalizes debt facts.
- Debt Strategy Engine evaluates debt strategy.
- Decision Engine evaluates user-facing decisions.
- Robototina explains.
- React presents.
- Atlas will simulate later.

## Boundary

DebtSummary belongs under `lib/financial-engine`.

It is an engine output, not a React model. React pages may display DebtSummary
fields, filter them and group them visually. React pages must not query raw debt
tables, calculate utilization, infer due status, merge Plaid/manual card data,
or decide whether missing data is acceptable for strategy.

DebtSummary does not replace Portfolio. Portfolio remains the balance,
inclusion, net worth and aggregate debt calculation boundary.

## Source Responsibilities

### PortfolioSummary

Portfolio owns:

- whether a debt is included in the financial picture
- balances used for net worth and debt totals
- total credit debt
- total liabilities
- total credit availability
- aggregate credit utilization
- connected/manual source inclusion policies

DebtSummary must use Portfolio as the source of truth for balance and inclusion.
If Portfolio excludes an account from the financial picture, DebtSummary should
not silently reintroduce it as an actionable debt.

### CardsSummary

Cards owns credit-card metadata:

- manual and connected card matching
- credit limits
- available credit
- card-level utilization
- minimum payments when known
- due day and next due date hints
- APR fields when manually available
- owner metadata
- card warnings
- missing-data checklist
- link confidence

DebtSummary should use CardsSummary as the source of truth for card metadata.
Manual card fields are intentionally important because connected Plaid cards
often do not expose minimum payments, due days or APR.

### lifecyclePayments

Payment Lifecycle owns timing and status:

- due date
- effective due date
- grace period
- grace until date
- open or closed lifecycle state
- overdue state
- initiated, paid, confirmed and compatibility status
- current payment instance context

DebtSummary must use lifecycle output for payment timing and status. It must not
recalculate whether a payment is overdue, inside grace or closed.

## DebtAccount Shape

DebtSummary v1 should expose normalized debt accounts.

```ts
type DebtSummary = {
  generatedAt: string
  accounts: DebtAccount[]
  totals: DebtSummaryTotals
  warnings: string[]
}

type DebtAccount = {
  id: string
  name: string
  debtType: 'credit_card' | 'loan'
  source: 'manual' | 'plaid' | 'merged' | 'legacy'

  balance: number
  availableCredit: number | null
  creditLimit: number | null
  utilizationPercent: number | null

  apr: number | null
  regularApr: number | null
  promoApr: number | null
  promoEndDate: string | null

  minimumPayment: number | null
  dueDay: number | null
  dueDate: string | null
  effectiveDueDate: string | null
  graceUntil: string | null
  graceDays: number | null
  paymentStatus: string | null

  ownerId: string | null
  ownerName: string | null

  portfolioLiabilityId: string | null
  creditCardId: string | null
  plaidAccountId: string | null
  scheduledPaymentId: string | null
  paymentInstanceId: string | null

  confidence: 'low' | 'medium' | 'high'
  missingData: DebtMissingDataFlag[]
  warnings: string[]
}

type DebtMissingDataFlag =
  | 'apr'
  | 'minimum_payment'
  | 'due_date'
  | 'credit_limit'
  | 'available_credit'
  | 'owner'
  | 'payment_link'

type DebtSummaryTotals = {
  totalDebt: number
  totalCreditDebt: number
  totalAvailableCredit: number
  creditUtilizationPercent: number | null
  totalMinimumPayment: number
}
```

The exact TypeScript implementation may evolve, but these concepts are part of
the v1 contract.

## Source Precedence

DebtSummary should follow these precedence rules:

1. Portfolio owns balances and inclusion.
2. Cards owns card metadata.
3. lifecyclePayments owns timing and status.
4. Manual values beat inferred values for APR, minimum payment, due day, owner
   and explicit card metadata.
5. Connected Plaid values beat stale manual values for current balance when
   Portfolio has accepted the connected account as the balance source.
6. Inferred values must stay distinguishable from explicit values.
7. Missing data must be explicit through `missingData`, `warnings` or
   confidence fields.
8. DebtSummary should prefer calm uncertainty over hidden assumptions.

Examples:

- If a connected card has a balance but no APR, DebtSummary should expose the
  balance and mark APR as missing.
- If a manual card has a due day and a matching lifecycle payment has the
  current due date, DebtSummary should expose the lifecycle date as timing truth.
- If available credit is inferred from credit limit minus balance, DebtSummary
  should allow consumers to know that it was inferred.
- If a card cannot be linked to a payment lifecycle record, DebtSummary should
  expose the account and flag `payment_link` as missing.

## What DebtSummary Must Not Do

DebtSummary must not:

- calculate payment lifecycle state
- replace Portfolio
- recalculate net worth, total assets or account inclusion
- query raw financial tables from React
- become a payoff simulator
- implement avalanche or snowball strategy
- decide whether to pay a bill today
- duplicate Decision Engine rules
- hide missing APR, due date, minimum payment or ownership data
- write to the database

DebtSummary is a normalized fact layer. Strategy belongs above it.

## Consumers

### Debt Strategy Engine

Debt Strategy should consume DebtSummary as its primary debt input.

It can evaluate:

- high utilization
- near-limit cards
- missing APR
- missing due date
- minimum payment risk
- payoff priority candidates
- cash-risk-sensitive acceleration warnings

Debt Strategy should not rebuild Portfolio/Card/Lifecycle composition.

### Decision Engine

Decision Engine may consume Debt Strategy outputs and selected DebtSummary facts
when debt affects an actionable recommendation.

Examples:

- recommend syncing stale cards before a major cash decision
- warn that a high-utilization card needs review
- avoid accelerating non-critical debt while liquidity risk is high

Decision Engine should not become the source of card metadata.

### Robototina

Robototina should explain DebtSummary and Debt Strategy outputs in natural
language.

Robototina may rephrase, group and prioritize messages. It must not query raw
debt tables or recreate card matching, due-date logic, lifecycle logic or debt
calculations.

### Future Atlas

Atlas will use DebtSummary as one of its scenario inputs.

Atlas may later simulate payoff strategies, cash-preservation scenarios and
household tradeoffs. Those simulations should consume DebtSummary and other
engine outputs rather than bypassing them.

## Implementation Phases

### Phase 1: Documentation

Create this contract and use it as the review target for the first helper.

No runtime behavior changes.

### Phase 2: `debt-summary.ts` Helper

Create `lib/financial-engine/debt-summary.ts`.

The helper should compose:

- `getPortfolioSummary()`
- `getCardsSummary()`
- `getLiquiditySummary()` or official lifecycle output

It should return `DebtSummary` without introducing new database tables or React
logic.

### Phase 3: Debt Strategy Refactor

Refactor `debt-strategy.ts` to consume DebtSummary.

The strategy layer should stop depending on fragile liability metadata fallbacks
for card-level fields that CardsSummary already owns.

### Phase 4: Fixtures

Add lightweight fixture scenarios for:

- high utilization
- missing APR
- missing due date
- minimum payment due
- near-limit card
- cash risk
- stale or low-confidence card metadata

Fixtures should avoid database calls and should be safe for review.

### Phase 5: Legacy Retirement

Identify legacy pages that still read debt/payment tables directly and migrate
or retire them behind official engine outputs.

This should happen carefully and separately from DebtSummary implementation.

### Phase 6: Future Schema Improvements

Only after DebtSummary proves the shape, consider schema proposals for missing
or weak debt metadata.

Possible future additions:

- APR history
- payment due-date source tracking
- minimum payment source tracking
- loan metadata
- statement balance
- last statement close date
- promotional APR terms
- confidence/source audit fields

No schema change is part of DebtSummary v1 documentation.

## Open Questions

- Should loans become first-class Portfolio liabilities before DebtSummary
  exposes loan strategy?
- Should inferred available credit carry a dedicated source field?
- Should stale Plaid card data lower confidence automatically?
- Should manual card APR support separate purchase, cash advance and balance
  transfer APRs later?

These questions should not block the v1 helper. They should remain visible so
Debt Strategy avoids overclaiming precision.
