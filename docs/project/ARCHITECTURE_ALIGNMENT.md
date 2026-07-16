# Architecture Alignment Audit

Last updated: 2026-07-16

## Target architecture

Data Sources -> Normalization -> Financial Engine -> Snapshot -> Decision Engine
-> Robototina -> React UI

Future:

Financial Engine -> Atlas -> MCP -> Automations

## What is aligned

- `lib/financial-engine/snapshot.ts` composes Portfolio, Liquidity, Planning,
  Review Queue, Dashboard, Timeline, Financial Summary and Decision Engine v1.
- `lib/financial-engine/decision-engine-v1.ts` consumes snapshot/output
  contracts and returns normalized `MansorDecision[]`.
- `lib/financial-engine/robototina-context.ts` calls
  `getFinancialEngineSnapshot()` and exposes Robototina context.
- `app/robototina/page.tsx` consumes `getRobototinaContext()` rather than raw
  financial tables.
- `app/api/robototina/answer/route.ts` is the official Q&A API.
- Legacy Pablo API is retired with `410 Gone`.
- Product Shell keeps React presentation-focused for the migrated pages.

## What is partially aligned

- Dashboard, Spending, History, Timeline, Planning and Income mostly consume
  engine/helper outputs, but still compute presentation view models in page
  code.
- Cards uses `getCardsSummary`, but Debt Strategy is not yet fully reliable
  because metadata is incomplete.
- Plaid is an integration route and necessarily writes source tables, but it
  should increasingly delegate identity, duplicate and reconciliation decisions
  to engine helpers.
- Data Health reads raw tables inside the Financial Engine helper by design;
  React only presents the report.

## What is not aligned

- Several legacy pages query tables directly and present financial data outside
  official contracts.
- `/cashflow` and `/payments` still read `scheduled_payments` directly.
- `/health-score` reads legacy priority/future obligation tables directly.
- `/accounts`, `/quick-entry`, `/imports`, and `/payment-instances` are legacy
  Client Component direct-data surfaces.
- `/assets`, `/priorities`, `/cashflow`, `/payments`,
  `/future-obligations`, `/health-score`, `/ath-movil`, and
  `/merchant-rules` are legacy server-page direct-data surfaces.

## Phase 0 alignment fixes

- `/goals` no longer reads/writes `financial_goals` from a Client Component.
  It now uses a server-rendered page, server actions and legacy goal helpers in
  `lib/financial-engine/goals.ts`.
- `/merchant-rules` no longer uses client-side Supabase writes; it now uses a
  server-rendered page and server action while preserving the same editing
  behavior.

## Financial Engine extraction readiness

Ready pieces:

- Most financial contracts are isolated under `lib/financial-engine`.
- Engine modules do not depend on React.
- Snapshot can execute from a Supabase client and user id.

Not ready:

- Supabase query shape is embedded across many engine modules.
- Some modules still depend on legacy table names and mixed ownership models.
- Tests are missing.
- Types are shared with app-specific management forms.

Conclusion: extraction to `packages/financial-engine` is feasible later, but not
ready now. First add tests, stabilize data contracts, and remove page-level
parallel logic.

## Atlas readiness

No implementation was found for a dedicated Atlas engine, scenario engine,
snapshot cloning helper, hypothetical input model, or comparison runner.

Minimum future contract:

```ts
type AtlasScenarioInput = {
  id: string
  label: string
  cashAdjustments?: unknown[]
  incomeOverrides?: unknown[]
  paymentOverrides?: unknown[]
  planningOverrides?: unknown[]
}

type AtlasResult = {
  currentSnapshotId: string
  scenario: AtlasScenarioInput
  simulatedSnapshot: FinancialEngineSnapshot
  comparison: unknown
}
```

Rule: Atlas must consume snapshot/contracts only and must not query SQL
directly.

## MCP readiness

No MCP implementation was found. MCP should wait until Atlas and Robototina AI
have stable contracts. Future MCP tools must call Financial Engine, Atlas, or
audited server actions; they must never read financial tables directly.
