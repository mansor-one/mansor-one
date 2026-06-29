# Merchant Knowledge Engine

Last updated: 2026-06-26

## Purpose

Merchant Knowledge Engine v1 defines how Mansor One can remember merchants and learn their financial meaning over time.

It does not categorize transactions directly yet. It does not write to database tables. It provides server-side helper utilities that future Transaction Intelligence, Robototina and review flows can consume.

## Core Ideas

Merchant is not category.

Examples:

- `STARBUCKS #034` is a merchant string.
- `STARBUCKS` is a normalized merchant.
- `food_restaurants` is the canonical financial category.

Plaid category is not canonical category.

Plaid categories can be useful signals, but they are vendor-provided labels. Mansor One needs canonical categories that represent financial meaning.

Canonical Category equals financial meaning.

Merchant Knowledge learns whether a normalized merchant usually maps to a canonical category with enough confidence.

## Merchant Knowledge vs Merchant Rules

Merchant Knowledge is memory and interpretation:

- normalized merchant name
- category currently believed
- times seen
- amount statistics
- confidence
- stability
- whether Robototina should ask again

Merchant Rules are future action rules:

- if merchant matches pattern, suggest or apply category
- if user confirms repeatedly, strengthen a rule
- if context changes, require review

Merchant Knowledge can feed Merchant Rules, but it is not the same thing.

## Normalization Examples

Starbucks variants:

- `STARBUCKS #034`
- `STARBUCKS PR`
- `STARBUCKS STORE`

Normalize to:

- `STARBUCKS`

Church variants:

- `CHURCH'S`
- `CHURCHS`
- `CHURCH CHICKEN`

Normalize to:

- `CHURCH'S`

## Confidence

Confidence should increase when:

- merchant appears multiple times
- amounts are relatively consistent
- a known canonical category is attached

Confidence should stay low when:

- merchant appears once
- category is missing
- amount pattern is volatile
- merchant is ambiguous

## Learning State

Suggested states:

- `new`: one observation, not enough history.
- `learning`: multiple observations, not stable yet.
- `stable`: enough confidence to avoid repeated questions.
- `needs_review`: missing or weak category signal.

## How It Feeds Transaction Intelligence

Merchant Knowledge can help Transaction Intelligence:

- group similar merchant strings
- explain why a category was suggested
- decide whether a transaction needs review
- decide whether Robototina should ask again
- strengthen future `transaction_rules`

It should not bypass review when confidence is weak.

## Dev Tooling

`/dev/merchant-knowledge` displays sample normalized merchants, confidence, category, statistics and raw JSON.

The page is temporary developer tooling and does not read or write transaction data.

## Future Migration

Future work may add persistent merchant knowledge tables or derive merchant knowledge from:

- `quick_entries`
- `plaid_imports`
- `transaction_suggestions`
- `transaction_rules`
- ATH Movil enrichments

This v1 foundation does not modify those tables.
