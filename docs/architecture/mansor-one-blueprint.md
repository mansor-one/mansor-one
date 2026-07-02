# Mansor One Architecture Blueprint v1

Last updated: 2026-07-02

## Vision

Mansor One is an autonomous financial operating system.

Its purpose is to understand the user's financial state, keep the money model current, surface what needs attention, and ask for human input only when something is ambiguous, risky or extraordinary.

The product should feel less like a spreadsheet and more like an operating layer:

- money sources are captured automatically when possible
- financial meaning is interpreted by engines
- Robototina explains what matters
- pages show focused windows into the same source of truth
- user review is reserved for decisions, uncertainty and exceptions

## Architecture Principle

Engines are the source of truth. Pages are windows.

Financial calculations, identity logic, categorization intelligence, payment lifecycle, reconciliation and decisions belong in engines under `lib/financial-engine` or clearly defined domain modules.

Pages should not duplicate calculations. A page may format, group for display, filter for UX, or trigger an explicit user action, but it should not become a second financial model.

## System Map

```text
                 +----------------------+
                 |      Data Sources    |
                 +----------------------+
                   | Plaid
                   | ATH Movil
                   | Gmail Manuel
                   | Gmail Soraya
                   | Manual Accounts
                   | Manual Entries
                   | OCR future
                   v
        +-----------------------------+
        |    Capture / Import Layer   |
        +-----------------------------+
          | plaid_imports
          | quick_entries
          | ath_movil_emails
          | payment_instances
          | manual account records
          v
        +-----------------------------+
        |       Knowledge Layer       |
        +-----------------------------+
          | Canonical Categories
          | Merchant Knowledge
          | Financial Identity
          | Transaction Intelligence
          v
        +-----------------------------+
        |    Core Financial Engines   |
        +-----------------------------+
          | Portfolio
          | Liquidity
          | Planning
          | Payment Lifecycle
          | Financial Summary
          | Decision Engine
          | Financial Reconciliation
          v
        +-----------------------------+
        |       User Experience       |
        +-----------------------------+
          | Dashboard
          | Robototina
          | Timeline
          | Cashflow
          | Planning
          | Health Score
          | Mobile future
          | Notifications
```

## Data Sources

### Plaid

Plaid provides connected account balances and bank/card transaction imports.

Plaid is only one source. It is not the center of Mansor One. It is an input into Portfolio, Liquidity, Transaction Intelligence and Reconciliation.

Plaid sync stores source facts in `plaid_accounts` and `plaid_imports`. It does not create confirmed ledger history automatically. See `plaid-sync.md`.

### ATH Movil

ATH Movil is enrichment and context, not the primary money source.

It can explain transfers, people, messages and counterparties that Plaid may not describe clearly.

### Gmail Manuel

Gmail Manuel can provide receipt, transfer and ATH Movil context. It should feed enrichment and review flows, not bypass the ledger or financial engines.

### Gmail Soraya

Gmail Soraya is useful for Cooperativa-related emails and manual or co-owned financial context.

Examples:

- Cooperativa notices
- loan/payment emails
- shared obligations
- family finance context that belongs in Planning, Reconciliation or future Loan Engine

This source should be treated as contextual enrichment. It should not automatically create money movement without review.

### Manual Accounts

Manual Accounts represent cash, accounts or balances that are not connected through Plaid.

They feed Portfolio and Liquidity through the Assets Engine.

### Manual Entries

Manual Entries are confirmed ledger activity. They live in `quick_entries` today and should remain treated as confirmed history until a future ledger model replaces or expands them.

### OCR Future

OCR can eventually capture bills, statements, receipts and notices.

OCR should feed capture/import and review queues first. It should not directly change the confirmed ledger without review.

## Capture / Import Layer

This layer gets external or manual information into Mansor One.

Current or planned surfaces include:

- Plaid sync/import
- Plaid account balance sync
- ATH Movil email import/enrichment
- manual quick entries
- manual accounts
- payment instance generation
- future OCR ingestion

Capture is not interpretation. It should store or expose source facts, then let Knowledge and Financial Engines interpret them.

Review Queue is the ingestion gate for unconfirmed movements. External sources can create observations and enrichment, but user confirmation is required before they become confirmed financial history.

## Knowledge Layer

### Canonical Categories

Canonical Categories define financial meaning using stable codes/ids.

Labels are display text. Free-text categories are legacy and should migrate gradually.

### Merchant Knowledge

Merchant Knowledge identifies repeated merchants and learned behavior.

It answers: "Have we seen this merchant before, and do we understand it?"

Merchant Learning should be event-driven: confirmed ledger movements and explicit user confirmations are learning events; raw imports and suggestions are only weak signals.

### Financial Identity

Financial Identity classifies what kind of thing a transaction name represents.

Examples:

- merchant
- person
- utility
- subscription
- loan
- credit card payment
- transfer
- income
- fee
- interest

It answers: "What kind of entity or event is this?"

### Transaction Intelligence

Transaction Intelligence manages suggested categories, review questions, learned rules and enrichments.

It should use a Google Photos-style confirmation model: ask small, confident questions and learn from repeated confirmations.

## Core Financial Engines

### Portfolio

Portfolio owns assets, liabilities, liquidity facts, net worth and allocation breakdowns.

It consumes connected and manual sources through normalized assets and liabilities.

### Liquidity

Liquidity owns payment and income timing.

It should use Portfolio's usable cash policy, then subtract committed payments and add confirmed income projections.

### Planning

Planning owns user-visible future obligations, priorities and planning items.

It should not become a substitute for ledger, portfolio or debt engines.

Recurring household services must separate the durable obligation from the current vendor/provider. Provider changes should preserve historical payments and only affect future planning context. See `planning-obligations.md`.

### Payment Lifecycle

Payment Lifecycle defines the states of a payment obligation and the expected cycle currently being evaluated.

Current canonical direction:

- `pending`: action may still be needed
- `initiated`: user started the payment; wait for confirmation
- `confirmed`: payment was verified

Legacy states like `paid` and `promise` remain during migration.

Dashboard, Cards, Timeline, Planning preview and Robototina should consume one shared lifecycle output. Closed cycles advance to the next expected due date, and overdue status requires an open cycle whose effective due date is before today.

### Financial Summary

Financial Summary interprets Portfolio, Liquidity and Planning.

It does not own raw data. It produces briefing lines, alerts, recommendations, dashboard summaries and health-oriented interpretation.

### Decision Engine

Decision Engine converts Financial Summary into prioritized actions.

It should not calculate balances. It decides what deserves attention now.

### Financial Reconciliation

Financial Reconciliation proposes matches between transactions/imports and payment instances.

In v1 it is read-only. Future versions can confirm payments after explicit review and audit trail support.

## Future Engines

### Financial Events / Windfalls

Models expected extraordinary income like Team Share Bonus or Christmas Bonus.

These events are planning inputs, not current cash.

### Payment Engine v2

Owns payment ledger, partial payments, arrears, paid amount, paid date and reconciliation history.

### Loan Engine

Models loans, payoff strategies, refinance decisions, consolidation and recurring debt obligations.

### Optimization Engine

Compares choices:

- pay down credit cards
- preserve cash
- balance transfer
- consolidate with a loan
- fund goals
- delay obligations

### Credit Profile

Tracks credit utilization, limits, available credit, debt mix and profile risk.

### Scenario Planner

Lets the user compare future outcomes before committing decisions.

### Financial Memory

Stores durable user preferences, repeated decisions, financial rules of thumb and household context.

### Household Model

Mansor One is household finance for Manuel and Soraya. Ownership should be explicit, shared surfaces should avoid hardcoding only Manuel, and Soraya/FirstBank production use requires depository account owner labeling. See `household-finance.md`.

## User Experience

### Dashboard

Dashboard is the main operating panel. It should summarize state, risks and next actions from engines.

### Robototina

Robototina is the briefing and decision companion.

She should ask focused questions, explain why something matters and reduce cognitive load.

### Timeline

Timeline shows projected cash movement over time.

It should consume Portfolio/Liquidity facts rather than recalculate starting cash.

### Cashflow

Cashflow should explain upcoming money timing and recurring pressure.

It is a planning window, not a separate calculation system.

### Planning

Planning organizes goals, priorities and future obligations.

It should consume Planning Engine and eventually Financial Events.

### Health Score

Health Score interprets Portfolio, Liquidity, Debt and Planning into user-readable state.

### Mobile Future

Mobile should focus on quick review, notifications, payment confirmations and Robototina briefings.

### Notifications

Notifications should be sparse and useful.

Mansor One should ask when:

- a payment is due
- a transaction needs review
- cash coverage changes
- an expected event arrives
- a financial decision needs approval

## Do Not Duplicate Calculations In Pages

Pages must not duplicate:

- liquid cash calculations
- debt totals
- credit availability
- portfolio totals
- payment lifecycle interpretation
- planning totals
- category logic
- merchant knowledge
- identity matching
- reconciliation scoring
- decision priority

If a page needs a number or interpretation, the relevant engine should expose it first.

## Current Direction

Mansor One is moving from page-local calculations toward domain engines:

- Portfolio owns assets, liabilities, net worth and liquidity facts.
- Liquidity owns payment and income timing.
- Planning owns future obligations.
- Financial Summary interprets today's state.
- Decision Engine prioritizes action.
- Reconciliation proposes payment confirmations.
- Knowledge engines reduce repeated review questions.

This separation is what allows the product to become more autonomous without becoming brittle.
