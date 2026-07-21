# Financial Architecture

## System boundary

Mansor One uses Supabase/Postgres as durable storage and the financial-engine modules as the calculation boundary. Pages should consume composed summaries instead of independently reinterpreting raw tables.

## Canonical entities

### Accounts

“Account” is the household-facing concept for a place that holds or moves money. It may be connected through Plaid or maintained manually. Account identity, visibility, archival state, ownership, and spendability are distinct from balance.

### Plaid accounts

`plaid_accounts` stores connected account identity and the latest Plaid balance snapshot. `plaid_account_id` is the stable external identifier; `connection_id` preserves institution lineage. Portfolio state (`account_status`, `is_hidden`, `include_in_dashboard`) controls presentation. `is_spendable` controls usable-cash eligibility. Credit liability fields are stored only when returned by Plaid Liabilities.

### Manual accounts

`accounts` stores user-maintained balances and account metadata. Manual records do not override a linked Plaid balance merely because their names are similar. Archived and replacement metadata preserve history.

### Cards

`credit_cards` stores household card configuration: limit, manual balance fallback, minimum payment fallback, due day, APR, autopay, suffix, and links to a Plaid account and payment schedule. A Card Profile is a composed read model, not another table.

### Loans

`liabilities` stores manually managed loan/debt facts such as lender, balance, APR, monthly payment, due/grace day, principal progress, and remaining term. Loan rows can enrich an obligation when identity matches; they are not duplicated into obligation instances.

### Obligations

`obligations` is the recurring obligation definition: name, type, owner, category, frequency, default amount, due-day rule, grace-period rule, and normal payment-method text. Providers are stored in `obligation_providers`.

### Obligation instances

`obligation_instances` is one dated occurrence of an obligation. `obligation_id` links back to the recurring definition. The instance carries expected/effective dates, expected amount, lifecycle status, source, and notes. Reconciliation attaches to the instance, never only to the recurring template.

### Payment schedules

`scheduled_payments` is the legacy/operational recurring schedule used by liquidity generation and some card links. `credit_card_id` connects a schedule to a card. It must not create a second obligation solely because both due and grace dates exist.

### Payments

“Payment” is a composed lifecycle view over obligation instances, scheduled occurrences, confirmed ledger evidence, and reconciliation links. It is represented in code by `PaymentInstance`/`TrustedPayment`; there is no new disconnected payments table.

### Reconciliation links

`obligation_payment_links` permanently links an obligation instance to a `quick_entry`, Plaid import, or manual confirmation. It stores confidence, reconciliation status, timestamps, score factors, confirmation details, and structured payment-account reference.

### Reconciliation events

`obligation_reconciliation_events` is append-only audit history for detection, manual confirmation, reconciliation, rejection, and lifecycle transitions. It explains why a link/status exists.

### Quick entries

`quick_entries` is the confirmed household ledger. A row may originate manually or be promoted from Plaid, but promotion must preserve source identifiers and remain idempotent.

### Plaid imports

`plaid_imports` is the bank-transaction staging and lineage table. It stores Plaid transaction/account identifiers and pending, posted, superseded, removed, rejected, and duplicate lifecycle metadata. A Plaid import is not confirmed spending until it is represented in the confirmed ledger.

### Planning items

`planning_items` represents goals and planning funds. `allocated_amount` is reserved/planned money. `spent_amount` is confirmed spending linked to that fund. Neither field replaces the transaction’s canonical spending category.

### Transaction-to-planning-item relationships

`planning_item_transactions` is the queryable relationship between a planning item and a confirmed transaction. It references the originating Plaid import and/or resulting quick entry and records the movement type. Unique indexes prevent the same transaction from incrementing a fund repeatedly.

### Allocated funds and spent amount

- `allocated_amount`: money assigned to the plan, independent of purchases.
- `spent_amount`: cumulative confirmed spending associated through transaction relationships.
- Available planning capacity is derived from these fields; a transaction does not mutate allocation.

### Confirmed ledger

The confirmed ledger is the filtered `quick_entries` collection produced by `getLedgerSummary()`, after exact-source deduplication and recorded duplicate resolutions. Spending, history, merchant knowledge, and reconciliation consume this read model.

## Relationship summary

```text
Plaid connection -> Plaid account -> Plaid import -> quick entry
                                      |                 |
                                      |                 +-> planning_item_transactions -> planning item
                                      +-> obligation_payment_links <- obligation instance <- obligation
Manual account --------------------------^        |
Credit card -> Plaid account / schedule           +-> reconciliation events
Loan ---------------------------------> obligation detail enrichment
```

## Supporting documents

- [SOURCE_OF_TRUTH.md](./SOURCE_OF_TRUTH.md)
- [DECISIONS.md](./DECISIONS.md)
- [MIGRATION_INDEX.md](./MIGRATION_INDEX.md)
- [docs/architecture/financial-engine-contract.md](./docs/architecture/financial-engine-contract.md)
