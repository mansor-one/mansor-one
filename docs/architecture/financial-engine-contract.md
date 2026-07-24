# Financial Engine Contract

Last updated: 2026-07-04

## Purpose

This document defines the public contract of the Mansor One Financial Engine.

The Financial Engine is the calculation boundary for the product. It converts
database facts into normalized financial summaries, lifecycle records and
decision context. React pages and assistant surfaces must consume these engine
outputs instead of recreating calculations or querying financial tables directly.

Core rule:

- Financial Engine calculates.
- Robototina and Atlas interpret.
- React presents.

## Boundary

Financial Engine code lives under `lib/financial-engine`.

The engine may read financial data through server-side Supabase clients and
return typed summaries. It must not contain UI, React components, Tailwind
classes or browser-only behavior.

React pages may compose visual layouts, filters, labels, toggles and local UI
state. React pages must not own financial formulas, payment lifecycle rules,
account inclusion rules, category systems, reconciliation logic or payment
deduplication.

Robototina and Atlas may explain, rank, narrate and recommend based on engine
outputs. They must not calculate money directly from raw tables.

## Official Entry Points

Use the barrel export in `lib/financial-engine/index.ts` unless a lower-level
module is explicitly part of the current domain workflow.

### Dashboard Summary

Entry point: `getDashboardSummary(supabase, userId)`

Returns: `DashboardSummary`

Contract:

- Composes `getLiquiditySummary()` and `getPlanningSummary()`.
- Exposes `liquidity` and `planning` for Dashboard, Timeline and assistant
  summaries.
- Carries `planning.overduePayments` from `liquidity.overduePayments` for
  compatibility.

Consumers:

- Dashboard
- Timeline
- Robototina
- dev Financial Engine pages

React may present this summary directly. React must not patch missing lifecycle
or planning calculations locally.

### Liquidity

Entry point: `getLiquiditySummary(supabase, userId)`

Returns: `LiquiditySummary`

Contract:

- Owns payment timing, income timing and cash projection outputs.
- Uses Portfolio's usable cash policy for available cash.
- Exposes connected accounts, manual accounts, credit cards, liquid cash,
  pending/initiated/committed payment groups, income schedule and result
  projections.
- Builds and exposes `lifecyclePayments`.

Important fields:

- `cashAvailableTotal`
- `resultToday`
- `resultAfterIncome`
- `pendingActionPayments`
- `initiatedPayments`
- `committedPayments`
- `overduePayments`
- `confirmedIncome`
- `lifecyclePayments`

`lifecyclePayments` is the payment source of truth for Dashboard and Timeline.
Those surfaces must not query `scheduled_payments` directly.

### Lifecycle Payments

Field: `liquidity.lifecyclePayments`

Type: `PaymentInstance[]`

Contract:

- Represents the unified Payment Lifecycle view.
- Merges current scheduled payments, legacy payment instances, confirmed ledger
  evidence and Phoenix obligation lifecycle records through engine logic.
- Handles status, open/closed lifecycle state, reconciliation context, overdue
  state, due dates and grace metadata when available.
- De-duplicates migrated legacy scheduled payments through engine logic.

Consumers:

- Dashboard upcoming/open payment cards
- Dashboard Payment Calendar
- Timeline
- Cards summaries when payment lifecycle context is needed
- Robototina and Atlas payment explanations

Rules:

- Do not create new payment logic in React.
- Do not read `scheduled_payments` directly from Dashboard or Timeline.
- Do not calculate overdue, due soon, grace, paid or initiated state in React
  except for pure display grouping over fields already returned by the engine.
- Do not duplicate Phoenix bridge or legacy de-dupe logic outside the engine.

### Portfolio

Entry point: `getPortfolioSummary(supabase, userId)`

Returns: `PortfolioSummary`

Contract:

- Owns assets, liabilities, cash, debt, credit availability, usable cash and net
  worth calculations.
- Resolves connected Plaid assets, manual assets and credit card liabilities.
- Applies account visibility and inclusion policies before returning totals.
- Uses conservative usable cash policy for available cash.

Important fields:

- `totalAssetBalance`
- `totalLiquidAvailable`
- `totalConnectedLiquidAvailable`
- `totalManualLiquidAvailable`
- `totalCreditDebt`
- `totalLiabilities`
- `netWorth`
- `creditUtilizationPercent`

Consumers:

- Dashboard
- Portfolio
- Health Score
- Financial Summary
- Decision Engine
- Robototina and Atlas balance/debt interpretations

React may display totals and breakdowns. React must not recalculate net worth,
usable cash, debt totals or account inclusion rules.

### Planning

Entry point: `getPlanningSummary(supabase, userId)`

Returns: `PlanningSummary`

Contract:

- Reads active `planning_items`.
- Represents planning pressure, priorities, funds and future planning items.
- Does not represent bills that belong to the Payment Lifecycle.
- Does not convert planning priorities into obligations unless a migration or
  explicit business rule has validated that change.

Related management helper:

- `planning-management.ts` owns server-side helper logic for editable
  Priorities & Funds UI.

Consumers:

- Dashboard planning card
- Planning page
- Financial Summary
- Decision Engine
- Robototina and Atlas planning interpretations

React may present planning items and forms. React must not treat funds as open
payment obligations.

### Financial Summary

Entry point: `getFinancialSummary(supabase, userId)`

Returns: `FinancialSummary`

Contract:

- Composes Portfolio, Dashboard/Liquidity and Planning outputs.
- Converts engine facts into a higher-level financial briefing.
- Produces status, strengths, risks, briefing metrics and action context.
- This is the preferred future input for assistant-facing financial context.

Consumers:

- dev Financial Summary
- Decision Engine
- future Robototina/Atlas context builders

Robototina and Atlas may interpret this summary, but they must not bypass it to
recalculate the same money values from tables.

### Decision Engine v1

Entry point: `buildMansorDecisionsV1FromSnapshot(snapshot)`

Snapshot field: `decisionEngineV1`

Returns: `MansorDecision[]`

Contract:

- Consumes only the Financial Engine snapshot and official engine outputs.
- Produces normalized, prioritized advisor decisions.
- Returns decision type, severity, title, recommendation, explanation,
  evidence, confidence and action target.
- Sorts actionable decisions ahead of generic summaries.

Decision Engine v1 is the official recommendation source for Robototina and
future Atlas. Decision Engine v0 and `getDecisionEngineResult()` are retired.

## React Consumption Rules

React can consume:

- `DashboardSummary`
- `LiquiditySummary`
- `PortfolioSummary`
- `PlanningSummary`
- `FinancialSummary`
- `MansorDecision[]` from `decisionEngineV1`
- typed rows or management data returned by explicit engine helpers

React can:

- render cards, tables, calendars, lists and forms
- group already-calculated records for display
- sort records for presentation
- hide/show sections
- format money and dates
- call server actions or API routes that delegate business logic to engine or
  domain helpers

React cannot:

- query financial tables directly to implement business logic
- duplicate Financial Engine formulas
- calculate net worth, usable cash, payment status, lifecycle state, debt totals
  or planning pressure independently
- use `scheduled_payments` directly for Dashboard or Timeline payment displays
- create a parallel payment lifecycle model
- create a parallel account inclusion model

## Robototina and Atlas Consumption Rules

Robototina and Atlas can consume:

- `getDashboardSummary()`
- `getFinancialSummary()`
- `getFinancialEngineSnapshot()`
- Decision Engine v1 decisions
- `getRobototinaContext()`
- `answerRobototinaQuestion()` for rules-based advisor Q&A
- selected summaries from Portfolio, Liquidity and Planning when narrower
  context is required

Robototina and Atlas can:

- explain what the engine returned
- identify risks and tradeoffs based on engine outputs
- compare engine-provided options
- turn decision context into user-facing guidance
- ask follow-up questions when business rules are missing

Robototina and Atlas cannot:

- calculate money directly from raw tables
- invent payment status or lifecycle state
- override account inclusion logic
- bypass `lifecyclePayments` for payment reasoning
- treat planning funds as bills

## Payment Lifecycle Rule

`liquidity.lifecyclePayments` is the official payment source of truth.

Dashboard, Timeline, Robototina and Atlas must use this field for payment
reasoning and payment presentation. Legacy `scheduled_payments` can still exist
as source data inside the engine, but it must not be queried directly by
Dashboard or Timeline.

Any change to payment lifecycle behavior belongs in the Financial Engine or the
Payment Lifecycle domain helpers, with validation against Phoenix migration
bridges and legacy compatibility.

## SQL and Data Access Rules

Financial UI pages must not add direct SQL or Supabase queries for financial
logic when an engine entry point exists.

Allowed direct data access from UI/server routes:

- authenticated server actions that call engine/domain helpers
- integration/admin pages where the page is managing integration state, not
  calculating financial truth
- simple read-only display of non-financial metadata when no engine contract
  exists yet

Not allowed:

- Dashboard direct queries for payments, balances or planning calculations
- Timeline direct queries for scheduled payments
- Robototina direct queries to calculate balances, debt or obligations
- duplicated payment de-dupe logic in React
- duplicated category, account, lifecycle or reconciliation rules outside the
  engine

## Stability Expectations

Public engine entry points should evolve deliberately. When fields are renamed,
removed or reinterpreted, update this contract and affected consumers in the
same change.

Compatibility fields may remain while consumers migrate, but the contract should
state which field is authoritative. For payments, `lifecyclePayments` is
authoritative. For usable cash and net worth, Portfolio summary outputs are
authoritative.

## Implementation Checklist

Before adding a financial feature:

1. Identify the engine entry point that owns the calculation.
2. Add or extend engine/domain helpers before changing React.
3. Keep SQL and Supabase reads inside server-side helpers.
4. Return typed outputs that React can present.
5. Use `lifecyclePayments` for payment UI and assistant reasoning.
6. Verify Dashboard and Timeline do not gain direct `scheduled_payments` reads.
7. Update this contract when a new public engine surface becomes official.
