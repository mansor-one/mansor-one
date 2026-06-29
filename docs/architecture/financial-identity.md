# Financial Identity Engine

Last updated: 2026-06-27

## Purpose

Financial Identity Engine v1 classifies transaction names into the kind of entity or event they represent.

It is read-only. It does not write to the database, modify transactions, change categorization behavior, update suggestions, or create rules.

## Relationship to Other Engines

Merchant Knowledge identifies merchants.

Examples:

- `STARBUCKS #034`
- `WALGREENS`
- `AMAZON`

Category Engine gives financial meaning.

Examples:

- food_dining
- health_pharmacy
- finance_credit_card_payment

Financial Identity Engine identifies what kind of thing the transaction name represents.

Examples:

- merchant
- person
- utility
- subscription
- loan
- credit_card_payment
- transfer
- income
- fee
- interest

These are related, but not interchangeable.

## Identity Types

Initial supported types:

- merchant
- person
- institution
- utility
- subscription
- loan
- credit_card_payment
- transfer
- income
- fee
- interest
- refund
- unknown

## Live Observations

The temporary dev page `/dev/financial-identity` reads recent authenticated user data from:

- `plaid_imports`
- `quick_entries`

For Plaid imports, it uses:

- `merchant || plaid_category`
- `amount`
- `transaction_date`

For quick entries, it uses:

- `description`
- `amount`
- `entry_date`

The page is read-only and does not mutate source records.

## Classification Examples

- `LUMA` -> utility
- `Walgreens` -> merchant
- `OpenAI` -> subscription
- `Apple` -> subscription
- `Nintendo` -> subscription
- `ATH MOVIL` / `TRANF ATHM` -> transfer
- `Soraya`, `Gabriela`, `Niko` inside ATH context -> person
- `COOP LARES` -> loan
- `EFT PMT`, `CREDIT CARD PAYMENT`, `CARDMEMBER` -> credit_card_payment
- `INTEREST CHARGE`, `IOD INTEREST` -> interest
- `RETURNED PAYMENT FEE` -> fee
- `CHECK DEPOSIT`, `PAYROLL`, `NOMINA` -> income
- `Amazon`, `Walmart`, `Costco` -> merchant
- unknown names -> unknown

## Future Role

Payment and Reconciliation Engine can use Financial Identity later to understand whether a transaction is likely:

- a bill payment
- a card payment
- a transfer
- a payroll deposit
- an interest charge
- a fee
- a merchant purchase

Robototina can also use identity classifications to ask better review questions.

## Boundaries

Financial Identity Engine does not:

- categorize transactions
- write to `quick_entries`
- write to `plaid_imports`
- write to `transaction_suggestions`
- create or modify `merchant_rules`
- reconcile payments
- replace Merchant Knowledge
- replace the Category Engine
