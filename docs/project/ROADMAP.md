# Mansor One Roadmap

Last updated: 2026-07-14

## Phase 0 — Project Alignment and Git Checkpoint

- Objective: freeze current product foundation safely.
- Scope: audit docs, README/index update, lint triage, root file cleanup,
  git checkpoint.
- Dependencies: current validation pass and user approval.
- Out of scope: feature work, schema changes, AI.
- Acceptance criteria: `npm run build`, `npx tsc --noEmit`,
  `git diff --check`, guard scripts understood, commit/tag created.
- Risks: committing accidental files or stale docs.
- Estimate: Small.

## Phase 1 — Product Polish

- Objective: make daily household routes feel like one polished product.
- Scope: dashboard, Robototina, Spending, History, Timeline, Plaid UX, Cards.
- Dependencies: Product Shell v1.
- Out of scope: financial logic changes.
- Acceptance criteria: pages use shared primitives, Spanish-first copy, clear
  loading/error/empty states, mobile review complete.
- Risks: CSS overrides masking old component problems.
- Estimate: Medium.

## Phase 2 — Data Completion

- Objective: close missing/unknown financial metadata.
- Scope: authenticated Data Health run, debt metadata, income ownership,
  transfers, duplicate/category conflicts, stale accounts.
- Dependencies: Data Health Inspector and user confirmation for ambiguous data.
- Out of scope: destructive cleanup.
- Acceptance criteria: live data health score improved and unknowns explained.
- Risks: RLS/schema gaps discovered during live readback.
- Estimate: Medium/Large.

## Phase 3 — Financial Integrity

- Objective: remove remaining parallel financial logic.
- Scope: migrate legacy pages or hide them, extract page view models,
  add engine tests, service-role route ownership audit.
- Dependencies: Phase 2 data findings.
- Out of scope: AI/Atlas/MCP.
- Acceptance criteria: no user-facing direct financial table reads outside
  official helpers/actions; first-party tests exist.
- Risks: legacy routes still used by bookmarks.
- Estimate: Large.

## Phase 4 — Vercel Preview

- Objective: first private Preview deployment.
- Scope: Preview env vars, Supabase redirects, stable Preview URL decision,
  smoke test app routes, provider callback matrix.
- Dependencies: Phase 0 checkpoint, lint/CI decision, provider access.
- Out of scope: Production deploy.
- Acceptance criteria: private authenticated Preview smoke checklist passes.
- Risks: Google/Plaid callbacks cannot use random Preview URLs.
- Estimate: Medium.

## Phase 5 — Robototina AI v1

- Objective: add AI explanation layer without violating data boundaries.
- Scope: context contract, prompt boundary, refusal/uncertainty rules, audit log.
- Dependencies: Data completeness, Decision Engine v1, Robototina Q&A.
- Out of scope: data writes, autonomous actions, direct SQL.
- Acceptance criteria: OpenAI receives only official context and returns cited
  explanations with limitations.
- Risks: hallucinated balances or sensitive data exposure.
- Estimate: Medium.

## Phase 6 — Atlas v1

- Objective: simulate scenarios from official snapshots.
- Scope: Current Snapshot + Scenario Input = Simulated Snapshot.
- Dependencies: stable Snapshot, data completeness, tests.
- Out of scope: automations and writes.
- Acceptance criteria: deterministic what-if comparisons with no table reads.
- Risks: duplicating Financial Engine calculations.
- Estimate: Large.

## Phase 7 — MCP and Automations

- Objective: expose safe tools after AI and Atlas are bounded.
- Scope: read-only tools first, then proposed actions requiring approval.
- Dependencies: Atlas v1, audit logging, reversible action model.
- Out of scope: direct table access by MCP.
- Acceptance criteria: every tool calls Financial Engine/contracts only.
- Risks: bypassing RLS, unaudited writes, over-automation.
- Estimate: Large.

## Phase 8 — Production Hardening

- Objective: production-grade reliability and security.
- Scope: rate limits, CSRF, logs, backups, rollback, provider production config,
  monitoring, error boundaries, RLS/advisor reviews.
- Dependencies: Preview success and financial integrity.
- Out of scope: major new features.
- Acceptance criteria: Production checklist fully checked and rollback tested.
- Risks: provider secrets/callback mismatch and long-running sync functions.
- Estimate: Large.
