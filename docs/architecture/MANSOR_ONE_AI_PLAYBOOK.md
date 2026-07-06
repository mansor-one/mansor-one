# Mansor One AI Playbook

## Vision
A holistic financial operating system where:
- Financial Engine calculates truth
- React presents insights clearly
- Robototina interprets context
- Atlas simulates futures
- Phoenix migrates legacy safely

## Security Rules for AI Tools
1. Never access: .env, certs, secrets
2. Never modify: git history
3. Never execute destructive SQL without approval
4. Always audit SQL/migrations
5. Preserve legacy data integrity

## Core Principles
- **Financial Engine**: Pure calculation layer (no UI)
- **React**: Presentation layer (no business logic)
- **Robototina**: AI interpretation layer (no direct writes)
- **Atlas**: Simulation/forecasting (read-only projections)
- **Phoenix**: Legacy migration (preserve original data)

## Validation Checklist
1. `npx tsc --noEmit` (type safety)
2. `git diff --check` (whitespace)
3. Targeted ESLint on changed files
4. Peer review for SQL/migrations

## Current Modules
1. Dashboard (FE-powered)
2. Portfolio (complete)
3. Planning (partial)
4. Timeline (complete)
5. Income (needs repair)
6. Review Queue (v1 complete)
7. Robototina (core operational)
8. Phoenix (migration in progress)

## Next Priorities
1. Phoenix final validation
2. Financial Engine audit
3. Robototina advisor evolution
4. Income system repair
5. Transfer ledger implementation
6. Review Queue v2 (Financial Inbox)

## Architectural Guardrails
1. No direct database writes from UI
2. No business logic in React
3. No legacy data deletion
4. All changes must pass validation checklist
5. Documentation required for architectural changes
