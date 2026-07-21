# Roadmap

## Completed

- Confirmed ledger and Review Queue decision boundary.
- Plaid pending/posted lifecycle and duplicate handling.
- Transaction-to-planning-fund relationships.
- Obligation lifecycle, pending settlement, and reconciliation audit trail.
- Shared Dashboard/Cash Flow/Timeline payment truth.
- Spendability policy and retirement exclusion.
- Credit-card authority and Timeline obligation drawer.

## Current stabilization

- Authenticated browser regression coverage for critical end-to-end flows.
- Resolve remaining Review Queue lint warnings.
- Audit legacy scheduled payments without obligation-instance links.
- Review existing Supabase RLS/performance advisor findings.
- Verify institution liability coverage after normal Plaid sync cycles.

## Next

### Dashboard visual consistency

Normalize spacing, card height, badges, drawers, loading states, and responsive behavior without changing financial calculations.

### Financial identity/logo layer

Introduce a reusable, source-aware identity object with existing/local assets and accessible fallbacks. Do not scrape or add an unapproved logo provider.

### Income classification audit

Audit payroll, refunds, transfers, reimbursements, and irregular income against confirmed-ledger categories and Dashboard totals.

## Future

### Broader financial entity unification

Replace remaining conservative name aliases with explicit reviewed relationships among accounts, cards, loans, obligations, merchants, and providers. Preserve historical source records.

### Robototina decision intelligence

Build explainable recommendations on top of stable Financial Engine summaries. Robototina should consume approved context interfaces rather than query raw tables.

### Operational maturity

- Full Playwright regression suite.
- Migration rollback rehearsal and restore verification.
- Structured observability for sync, promotion, and reconciliation failures.
- Security and performance remediation sprint.
