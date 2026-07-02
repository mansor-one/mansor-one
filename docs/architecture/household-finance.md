# Household Finance

Last updated: 2026-07-02

## Purpose

Mansor One is a household finance system for Manuel and Soraya.

The product should avoid assuming that every account, transaction, obligation or decision belongs only to Manuel.

## Ownership Model Direction

Future ownership should support:

- Manuel
- Soraya
- Shared / household
- business or external context such as Vec Solutions when appropriate
- unknown owner until classified

Owner labels should be domain data, not page-specific display hacks.

## Current UI Guidance

Shared surfaces may greet or refer to:

- Manuel y Soraya
- familia
- household

Avoid user-facing copy that says only Manuel owns all finances unless the data is specifically Manuel-owned.

## Plaid Readiness

Before connecting Soraya FirstBank for production use:

- depository accounts need owner labeling
- household ownership needs a durable model
- Review Queue should show owner/account context clearly
- Spending, History, Dashboard and Robototina should consume owner context from Financial Engine

## Planning

Planning and obligations should support household-owned services and commitments.

Examples:

- Lawn service / Recorte de grama: owner household
- Pest control / Fumigacion: owner household

## Robototina

Robototina should reason about the household context.

She should not produce conflicting numbers from page-level logic. Her daily briefing should use the same Financial Engine outputs as Dashboard, Cards, Timeline and Planning preview.

## Future Work

- Add durable household member model.
- Add owner labels for Plaid depository accounts.
- Add owner-aware Review Queue context.
- Add owner filters to Spending and History when needed.
- Route household insights through Financial Engine, not page-level calculations.
