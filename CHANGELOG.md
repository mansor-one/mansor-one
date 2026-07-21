# Changelog

## July 2026 — Financial Foundation Milestone

### Review and ledger

- Redesigned the Review Queue decision experience around the transaction’s household meaning.
- Added canonical transaction type, category, owner, note, and planning-fund decision fields.
- Added real transaction-to-fund relationships and idempotent confirmed-ledger promotion.
- Added pending-to-posted Plaid lifecycle handling, removed/superseded states, and duplicate diagnostics.

### Obligations and payment truth

- Added Smart Payment Reconciliation with deterministic evidence, confidence scoring, uniqueness protection, and audit events.
- Added manual payment confirmation and Pending Settlement risk exclusion.
- Unified Dashboard Financial Health, Cash Flow, and Timeline on shared trusted payment truth.
- Added explainable Financial Health totals and drill-down navigation.

### Portfolio and liquidity

- Applied consistent financial color semantics with text/icon reinforcement.
- Added explicit investment spendability and retirement liquidity exclusion.
- Added authoritative card-to-Plaid/schedule mapping and Plaid Liabilities ingestion.
- Replaced duplicate card presentation and `Min: N/A` with sourced values or a Configure action.

### Timeline and payment UX

- Added a clickable obligation calendar and responsive obligation drawer.
- Consolidated instance, schedule, card/loan, account, reconciliation, and missing-information context.
- Clarified contractual due date versus grace deadline and removed repeated daily grace cards.
- Replaced free-text known-account entry with structured payment-account selection and deterministic suggestions.
- Preserved historical text-only payment confirmations.
