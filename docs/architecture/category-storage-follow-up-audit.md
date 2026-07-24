# Category Storage Follow-Up Audit

Last updated: 2026-07-02

Status: local code/schema audit only. No Supabase SQL was run for this audit.

## Trigger

Project Phoenix Batch 1 uses `obligations.category_code` values such as
`debt_auto_loan` and `debt_mortgage`. Manuel confirmed that the live Supabase
database does not currently have `public.transaction_categories`, so
`migrations/20260702_financial_categories_v2.sql` must not be used as a Batch 1
prerequisite as-is.

## Batch 1 Dependency Check

`scripts/project-phoenix/03_batch_1_vehicles_loans.sql` does not reference
`public.transaction_categories`.

It writes category values only as text into:

- `public.obligations.category_code`

The Batch 1 parity report also compares only the text value in
`obligations.category_code`. It does not join to, validate against, insert into,
or update `transaction_categories`.

Conclusion: Batch 1 can run without the category migration, assuming the
accepted contract is that `obligations.category_code` is currently a soft text
code.

## Where Categories Currently Live

Current runtime category source:

- `lib/financial-engine/categories.ts`
  - Defines the in-code canonical category registry.
  - Powers dashboard/spending/review-queue category resolution through helpers
    such as `canonicalCategoryCodeForText`, `getCategoryByCode`, and
    `getSystemCategories`.

Current persisted category fields are still mostly legacy text:

- `quick_entries.category`
- `plaid_imports.suggested_category`
- `plaid_imports.plaid_category`
- `scheduled_payments.category`
- `payment_instances.category`
- `future_obligations.category`
- `planning_items.category`
- `transaction_suggestions.suggested_category`
- `merchant_rules.suggested_category`

Newer obligation domain field:

- `obligations.category_code`

This field is text and currently does not require a foreign key to a category
table.

## Obsolete Or Wrong Migration Risk

The repo contains `migrations/20260626_transaction_categories_v1.sql`, which
creates `public.transaction_categories`, and
`migrations/20260702_financial_categories_v2.sql`, which assumes that table
already exists.

Given the live database does not have `public.transaction_categories`,
`20260702_financial_categories_v2.sql` is not safe as a standalone migration.
It is either:

- obsolete for the current architecture, if runtime categories are intended to
  remain code-backed for now, or
- incomplete/wrong as a migration, if a database-backed category catalog is
  still desired.

## Recommended Follow-Up

1. Do not run `migrations/20260702_financial_categories_v2.sql` before Batch 1.
2. Treat Batch 1 category codes as soft text values on `obligations`.
3. Decide whether canonical categories should live in code only or in a
   persistent table.
4. If the table-backed model is still desired, create a fresh audited category
   migration that:
   - verifies whether `public.transaction_categories` exists,
   - creates it if the architecture still needs it,
   - reconciles it with `lib/financial-engine/categories.ts`,
   - does not block obligation migration,
   - and includes a read-only parity query.
5. If the code-backed model is preferred, mark the transaction category
   migrations as legacy/obsolete and keep `category_code` as text until a later
   category persistence design is approved.
