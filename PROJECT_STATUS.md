# Mansor One Project Status

Status date: 2026-07-20

## Product vision

Mansor One is a household financial operating system. It turns connected-bank data, manual financial records, recurring obligations, and planning funds into an explainable ledger and a consistent view of spending, liquidity, obligations, and financial risk. Every important number should be traceable to the records and filters that produced it.

## Completed capabilities

- Plaid account and transaction synchronization with pending-to-posted lifecycle handling and idempotent source identifiers.
- Confirmed ledger backed by `quick_entries`, with duplicate-resolution history rather than destructive deletion.
- Review Queue transaction decisions, including canonical category, transaction type, owner, note, and real planning-fund association.
- Confirmed spending that excludes pending, removed, superseded, rejected, and duplicate records and reports review exclusions.
- Planning funds with separate allocated and spent amounts.
- Obligation lifecycle, deterministic reconciliation, manual payment confirmation, pending settlement, and audit events.
- Shared payment truth across Dashboard Financial Health, Cash Flow, and Timeline.
- Dashboard KPI drill-down routes that preserve calculation filters.
- Financial-impact classification and accessible color semantics.
- Explicit liquidity policy: retirement and non-spendable investments remain assets but not usable cash.
- Unified credit-card profiles with Plaid balance authority, minimum-payment precedence, and lineage.
- Clickable Timeline calendar with obligation drawer, Spanish lifecycle copy, grace-deadline presentation, and structured payment-account selection.

## Known issues

- Legacy tables and modern canonical models coexist. Some older scheduled payments do not yet have an `obligation_instance_id`; the drawer identifies these rather than inventing a relationship.
- Some institution liability feeds do not return minimum payment or due date. These values remain “Not configured” unless an authoritative manual or recurring source exists.
- Several older RLS policies and unused indexes remain flagged by Supabase advisors and require a dedicated security/performance review.
- Review Queue retains six unused legacy presentation helpers that generate lint warnings but do not affect runtime behavior.
- Entity matching still includes conservative name aliases where explicit foreign keys have not yet been configured.
- Website, policy reference, and customer-support metadata are incomplete for many obligations.

## Validation status

- Automated suite: 10 test files, 42 tests passing.
- Production build and TypeScript validation: passing.
- ESLint: zero errors; six known unused-code warnings in Review Queue.
- `git diff --check`: passing at checkpoint preparation.
- July milestone migrations: confirmed present in Supabase migration history. See [MIGRATION_INDEX.md](./MIGRATION_INDEX.md).

## Next recommended sprint

Dashboard Visual Consistency and Entity Identity Foundation:

1. Normalize Dashboard card height, spacing, badges, and drawer patterns without changing calculations.
2. Introduce a reusable financial identity object for institution, merchant, card network, and category fallback imagery.
3. Replace remaining name-based links with reviewed entity relationships where safe.
4. Add authenticated browser-level regression coverage for Dashboard drill-downs, Timeline drawer state, and Review Queue decisions.

See [ROADMAP.md](./ROADMAP.md) for sequencing.
