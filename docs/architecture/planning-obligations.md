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

- `obligations`: durable recurring need, owner, category, frequency, expected amount.
- `obligation_providers`: current and historical providers, contact info, active dates.
- `obligation_instances`: expected cycle-level payment/service occurrence.
- `obligation_payment_links`: manual or reconciled links to Plaid imports or confirmed ledger rows.
- `quick_entries` / ledger: confirmed historical payment movements.

Obligations v1 creates these tables as a schema foundation only. It does not connect UI, migrate `scheduled_payments`, seed real data or alter ledger calculations yet.

## Planning V2 Requirements

- Use generic categories that scale across the household.
- Support owner values such as Manuel, Soraya, Shared/household and Unknown.
- Keep provider editable without rewriting historical payments.
- Allow estimated amounts when exact bill/service amount is unknown.
- Feed Dashboard, Robototina, Timeline and future notifications through Financial Engine.
- Keep direct page-level calculations out of Planning UI.

## Obligations V1 Foundation

Migration: `20260702_obligations_v1.sql`.

Tables:

- `obligations`
- `obligation_providers`
- `obligation_instances`
- `obligation_payment_links`

Security:

- every table has `user_id`
- RLS is enabled from day one
- authenticated policies scope select/insert/update/delete to `auth.uid()`
- child tables use composite foreign keys with `(id, user_id)` to prevent cross-user obligation/provider/instance links

Not included in v1:

- UI
- seed data
- scheduled payment migration
- Payment Lifecycle engine integration
- manual mark-paid API
- payment link UI

## Product Behavior

The Planning UI should show the obligation first and the current provider second.

Examples:

- Recorte de grama, provided by Figueroa Guardia.
- Fumigacion, provided by Felix.

If Manuel changes the provider, the UI should preserve old payments under the original provider context while future expected payments use the new provider.
