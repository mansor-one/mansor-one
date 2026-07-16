# Mansor One Project Audit

Last updated: 2026-07-16

## Scores

| Dimension | Score | Basis |
| --- | ---: | --- |
| Preview Readiness | 86/100 | Build, TypeScript, lint and guards pass; env/provider setup still pending |
| Production Readiness | 68/100 | Security improved, but service-role routes, provider setup and legacy surfaces remain |
| AI Readiness | 58/100 | Robototina context exists, but data completeness, provenance and prompt boundary need hardening |
| Financial Integrity | 70/100 | Engine centralized and duplicate resolution exists; `/goals` P0 fixed, but data gaps and legacy direct reads remain |
| UX Product Readiness | 63/100 | Product Shell complete; page content still legacy in many areas |

## Hallazgos criticos

No unresolved critical findings remain from Phase 0 validation.

## Hallazgos corregidos en Phase 0

### Client-side financial writes removed from `/goals`

- Evidence: `/goals` now uses server page/actions and legacy goal helpers in
  `lib/financial-engine/goals.ts`. Client component `GoalCard` only manages
  local edit state and submits forms.
- Files: `app/goals/page.tsx`, `app/goals/actions.ts`,
  `app/goals/GoalCard.tsx`, `lib/financial-engine/goals.ts`.
- Impact: React client no longer reads/writes `financial_goals`.
- Recommendation: later migrate the legacy table/model into the official Goal
  Engine contract.
- Priority: resolved P0; remaining modernization is P2.
- Blocks Preview: No, if route is hidden/legacy.
- Blocks AI: No as client-side bypass; still not an AI input source.
- Blocks Production: No as P0; still legacy surface.

### Global lint passes

- Evidence: `npm run lint` passes after Phase 0.
- Files: listed above.
- Impact: CI confidence improved.
- Recommendation: keep lint as required validation.
- Priority: resolved P0.
- Blocks Preview: No.
- Blocks AI: No.
- Blocks Production: No.

## Hallazgos altos

### Legacy pages query financial tables directly

- Evidence: direct page queries remain in `/accounts`, `/quick-entry`,
  `/payment-instances`, `/imports`, `/assets`, `/priorities`, `/cashflow`,
  `/payments`, `/future-obligations`, `/health-score`, and `/ath-movil`.
  `/goals` was removed from this active finding in Phase 0 because it now uses
  server actions/helpers.
- Files: see `rg "from\\('" app --glob "page.tsx"` output.
- Impact: inconsistent view models and duplicate logic risk.
- Recommendation: mark as legacy/internal or migrate one by one to official
  Financial Engine helpers.
- Priority: P1.
- Blocks Preview: No if navigation excludes them.
- Blocks AI: Yes if AI consumes their results.
- Blocks Production: Yes if user-facing.

### Dashboard and Spending still build large view models in page code

- Evidence: `app/page.tsx` contains category resolution, dedupe, top merchants,
  payment traffic light, financial health and Robototina briefing helpers.
  `app/spending/page.tsx` computes period totals and category summaries.
- Files: `app/page.tsx`, `app/spending/page.tsx`.
- Impact: not all business-ish presentation logic is centralized.
- Recommendation: extract display-only view models into engine/presenter helpers
  with clear contracts.
- Priority: P1.
- Blocks Preview: No.
- Blocks AI: Medium risk.
- Blocks Production: Medium risk.

### Plaid is functional but not provider-complete

- Evidence: routes exist for create link token, exchange public token, sync
  accounts and sync imports; no webhook route or explicit callback matrix in
  runtime config.
- Files: `app/api/plaid/*`, `lib/plaid/*`, deployment docs.
- Impact: manual sync works better than autonomous reliability.
- Recommendation: add stable Preview callback strategy, webhook route, retry
  policy, and institution health model before Production.
- Priority: P1.
- Blocks Preview: Partial.
- Blocks AI: No.
- Blocks Production: Yes.

### Data Health does not guarantee live data completeness by itself

- Evidence: `lib/financial-engine/data-health.ts` inspects many tables and
  returns unknown on inaccessible paths, but this audit did not run an
  authenticated browser/session readback.
- Files: `lib/financial-engine/data-health.ts`, `/dev/data-health`.
- Impact: current data quality cannot be declared complete from code alone.
- Recommendation: run authenticated Data Health and export current findings
  before AI or Production.
- Priority: P1.
- Blocks Preview: No.
- Blocks AI: Yes.
- Blocks Production: Yes.

### Service role is used in multiple route handlers

- Evidence: `SUPABASE_SERVICE_ROLE_KEY` is referenced in Plaid and Gmail route
  modules.
- Files: `app/api/plaid/*`, `app/api/gmail/ath-import/route.ts`.
- Impact: acceptable only while strictly server-only and authenticated; high
  blast radius if imported into client or exposed.
- Recommendation: keep server-only, audit ownership predicates, and prefer
  authenticated Supabase clients where possible.
- Priority: P1.
- Blocks Preview: No.
- Blocks Production: Needs review.

## Hallazgos medios

### Legacy advisor guard ignores historical docs and passes

- Evidence: `node scripts/check-legacy-advisor-usage.mjs` now searches active
  code roots (`app`, `lib`, `scripts`) and passes. Historical docs can mention
  retired routes without failing the guard.
- Files: `scripts/check-legacy-advisor-usage.mjs`, deployment docs,
  `docs/project/*`.
- Impact: guard now checks real legacy usage instead of documentation history.
- Recommendation: keep docs out of active-code guard.
- Priority: resolved P2.
- Blocks Preview: No.
- Blocks AI: No.
- Blocks Production: No.

### Product Shell complete but content still legacy

- Evidence: `AppShell`, `PrimaryNav`, `PageHeader` exist; many internal cards,
  tables, labels and forms still carry old copy and dense layouts.
- Files: `app/*/page.tsx`, `CardsClient`, `HistoryClient`.
- Impact: product feels partially polished.
- Recommendation: page-by-page polish after shell foundation.
- Priority: P2.
- Blocks Preview: No.
- Blocks AI: No.
- Blocks Production: User trust risk.

### No first-party tests found

- Evidence: `find` excluding `.next` and `node_modules` found no test/spec
  files.
- Files: none.
- Impact: validation depends on build, tsc, lint and manual probes.
- Recommendation: add fixtures/tests for engine contracts, duplicate
  resolution, Robototina Q&A and Plaid sync helpers.
- Priority: P2.
- Blocks Preview: No.
- Blocks Production: Medium.

## Hallazgos bajos

### Root docs are stale

- Evidence: `README.md` and `docs/README.md` say last updated 2026-06-26 and
  do not fully reflect Product Shell, Data Health, Debt Strategy, Robototina Q&A
  and legacy retirement.
- Files: `README.md`, `docs/README.md`.
- Impact: onboarding confusion.
- Recommendation: update index after audit docs are accepted.
- Priority: P3.
- Blocks Preview: No.
- Blocks AI: No.
- Blocks Production: No.

### Accidental root files exist

- Evidence: root contains zero-byte or stray files: `1`, `Build`, `next`,
  `mansor-one@0.1.0`.
- Files: project root.
- Impact: clutter and possible accidental commit.
- Recommendation: remove after approval or add cleanup checkpoint.
- Priority: P3.
- Blocks Preview: No.
- Blocks AI: No.
- Blocks Production: No.

## Inventory summary

- Routes: app routes build successfully under Next.js.
- API routes: Plaid, Gmail, Google OAuth, cards, ledger, review queue,
  Robototina, retired Pablo, dev transaction intelligence.
- Engines: 37 files under `lib/financial-engine`.
- Migrations: 23 SQL migrations.
- Scripts: duplicate resolution, Phoenix, security guards, seed/audit SQL.
- Tests: no first-party tests found.
- Cron/jobs: no `vercel.json` or scheduled job config found.
- Legacy: `/advisor`, `/advisor-v2`, `/pablo-chat`, `/goals`,
  `/priorities`, `/cashflow`, `/payments`, `/accounts`, `/imports`,
  `/merchant-rules`, `/payment-instances`.

## Validation results

| Command | Result |
| --- | --- |
| `git status --short` | Dirty worktree with product shell changes and prior untracked work |
| `git log --oneline -n 20` | Recent checkpoint: `f49fb9a security(deployment): gate internal routes and prepare Vercel preview` |
| `git diff --stat` | Active tracked diff across app shell/pages/docs/index |
| `git diff --check` | Passed after audit docs |
| `npm run build` | Passed with approved network access for Next fonts |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed after Phase 0 |
| `node scripts/check-vercel-security-gate.mjs` | Passed |
| `node scripts/check-legacy-advisor-usage.mjs` | Passed after script scope update |
