# Planning Obligations

Last updated: 2026-07-02

## Purpose

Planning obligations represent recurring household commitments, services, and expected payments.

The obligation is the durable household need. The vendor or provider is only the current person or company fulfilling that need.

This matters because a household can change providers without deleting or rewriting historical payments.

Planning v2 should own recurring obligations, household services, goals/priorities and future commitments as planning context. It should not become ledger, portfolio or debt calculation logic.

## Design Rule

Separate obligation from vendor.

- Obligation: the recurring financial/service commitment.
- Category: the generic financial meaning.
- Provider/vendor: the current person or business used for the obligation.
- Payment history: confirmed ledger movements and payment lifecycle records.

Changing a provider must not delete, rewrite, or detach historical payments.

## Editable Fields

Future UI should allow editing:

- provider/vendor
- phone
- amount
- frequency
- category
- owner
- payment method

Provider changes should create a new current provider state or history entry, not mutate past payment records.

## Household Services

### Lawn Service

- Obligation: Lawn service / Recorte de grama
- Category: Yard Maintenance or Home Maintenance
- Current vendor: Figueroa Guardia
- Phone: 787-906-2129
- Amount: 30
- Frequency: monthly
- Payment method: ATH Movil
- Owner: household

### Pest Control

- Obligation: Pest control / Fumigacion
- Category: Home Maintenance / Pest Control
- Current vendor: Felix
- Phone: 787-312-8690
- Amount: 20 estimated
- Frequency: every 3 months
- Last service: March 2026
- Owner: household

## Future Model Direction

Recommended conceptual entities:

- `household_obligations`: durable recurring need, owner, category, frequency, expected amount.
- `obligation_providers`: current and historical providers, contact info, active dates.
- `payment_instances`: expected cycle-level payment/service occurrence.
- `quick_entries` / ledger: confirmed historical payment movements.

Until schema exists, keep this as design guidance only.

## Planning V2 Requirements

- Use generic categories that scale across the household.
- Support owner values such as Manuel, Soraya, Shared/household and Unknown.
- Keep provider editable without rewriting historical payments.
- Allow estimated amounts when exact bill/service amount is unknown.
- Feed Dashboard, Robototina, Timeline and future notifications through Financial Engine.
- Keep direct page-level calculations out of Planning UI.

## Product Behavior

The Planning UI should show the obligation first and the current provider second.

Examples:

- Recorte de grama, provided by Figueroa Guardia.
- Fumigacion, provided by Felix.

If Manuel changes the provider, the UI should preserve old payments under the original provider context while future expected payments use the new provider.
