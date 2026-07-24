# Project Phoenix - Legacy Retirement Plan

Last updated: 2026-07-02

Status: audit/design only. No database writes have been run.

## Goal

Project Phoenix retires legacy financial sources only after every useful row has
an explicit destination in the new domains:

- `obligations`
- `obligation_providers`
- `obligation_instances`
- `obligation_payment_links`
- `planning_items`
- ledger/`quick_entries` as immutable history

## Proposal Files

- `scripts/project-phoenix/01_legacy_row_mapping_report.sql` is the canonical
  read-only mapping table. It emits:
  `legacy_table`, `legacy_id`, `name`, `amount`, `frequency_date`,
  `target_domain`, `target_action`, `confidence`, and `notes`.
- `scripts/project-phoenix/02_proposed_migration_draft.sql` is a proposal-only
  migration draft. It intentionally aborts immediately and should not be run
  until reviewed.

## Duplicate Decisions

| Duplicate | Decision | Confidence | Notes |
| --- | --- | --- | --- |
| `liabilities.Honda Soraya` and `scheduled_payments.Guagua Soraya` | Merge into one `Honda Soraya` loan obligation. | High | `liabilities` keeps payoff metadata; `scheduled_payments` supplies recurring-payment history. |
| `liabilities.Hipoteca Casa Cayey` and `scheduled_payments.Hipoteca` | Merge into one mortgage obligation. | High | Keep original loan metadata in `liabilities`; use obligation lifecycle for monthly payment timing. |
| Card rows: `Popular Visa`, `US Bank`, `Synchrony`, `Chase` | Defer to Cards domain. | Medium | Create obligation bridge only if Cards needs lifecycle integration. `Chase` has amount `0` and needs validation. |
| `future_obligations` already present in `planning_items` | Keep in `planning_items`; avoid duplicate migration. | High | `planning_items.legacy_source`/`legacy_id` already records provenance. |

## Batch Plan

### Batch 1: Vehicles and Loans

Target: `obligations`, with `liabilities` retained as loan/payoff history.

Rows:

- `liabilities.6d5f3910-f2cb-4043-8fae-4f71329bfc97` - Honda Soraya, `$947.78`.
- `scheduled_payments.b942563d-261f-401a-abc5-6d5fabbf8f23` - Guagua Soraya, `$947.78`.
- `liabilities.0ada3acb-29d2-4958-88a6-283624c7d8e9` - Toyota Corolla Cross, `$778.79`.
- `liabilities.634c9d6f-fd5a-433a-ac4e-797fae06233d` - Hipoteca Casa Cayey, `$752.07`.
- `scheduled_payments.57044a71-1f26-4a29-954d-573dfb0d2ce2` - Hipoteca, `$752.07`.

### Batch 2: Utilities and Services

Target: `obligations`; providers only when provider identity is verified.

Rows:

- `Agua / AAA` from `scheduled_payments.ef7ee92b-2b22-4f60-8b82-3acaec42930c`.
- `Luz / LUMA` from `scheduled_payments.81071b2b-5f16-41ca-8838-3a359dc595ad`.
- `Internet` from `scheduled_payments.406f0a86-34da-4c31-b174-93388ea8dc2e`.
- `SunRun` from `scheduled_payments.9ae616f7-6746-4214-810a-eb16c5959425`.
- `Grama` from `scheduled_payments.8b7a4374-c882-433b-ac15-5a6818ae1bcb`.
- `Celulares` from `scheduled_payments.6653e7dd-30a4-4e8b-b863-efae0f9da49d`.
- `Barbero` from `scheduled_payments.187b90d1-c545-4b5e-ac42-0857784578cc`.

### Batch 3: Education and Family Recurring

Target: `obligations`, with active-month/custom-frequency notes preserved.

Rows:

- `Colegio Gaby` from `scheduled_payments.deb493fa-8dec-40d9-8a18-29495edf87dc`.
- `Tutorias Gaby` from `scheduled_payments.6da31c21-9632-4c34-b98f-7d66f18fee61`.
- `Unas Gaby` from `scheduled_payments.209ed644-49b3-4e85-832e-064962221ed4`.
- `Unas Soraya` from `scheduled_payments.47a4b3bb-8215-46c3-a308-840f77f4fe6f`.
- `Seguro Casa` from `scheduled_payments.16c627ab-97c5-4d23-806a-6dc993f21ced`.

### Batch 4: Cards If Needed

Target: Cards first; `obligations` only as a lifecycle bridge.

Rows:

- `Popular Visa` from `scheduled_payments.7ea5a798-44ad-4b7c-9530-b3b21341051e`.
- `US Bank` from `scheduled_payments.48166355-bd5b-498a-96b1-dd56903da144`.
- `Synchrony` from `scheduled_payments.eb2f86cb-4eb8-4133-89d8-a3d8b4b71c43`.
- `Chase` from `scheduled_payments.e2c7ffca-22b0-4f67-85c9-7e89eb78e47b`.

### Batch 5: Planning and Future Items

Target: `planning_items`; do not create recurring obligations unless recurrence
is confirmed.

Rows:

- `future_obligations.5c2a8680-1c98-48da-9d81-4e713fe04f18` - Marbete Soraya.
- `future_obligations.acaa3938-94ef-45a7-94e4-fdcefd145fa6` - Planilla Vec Solution - Soraya.
- `future_obligations.01db7f3a-3df2-44f7-b1b8-dcfd42463bad` - Libros Gaby.
- `future_obligations.975e298a-f39b-415c-8430-64390d24cbe1` - Seguro Poliza Guagua - Soraya.
- `future_obligations.19d3567e-46d7-49c3-a736-c222a30cc563` - Cuarto Andrea.
- `future_obligations.f9124648-1ecd-4159-8df5-ae7e9c0f05c1` - Cuarto Gaby.
- `future_obligations.294e3a22-962a-44d3-a2ba-8eebf44d01b7` - AutoExpreso.
- `future_obligations.6f5dc0bb-ed36-4da3-beb4-b0135cee0b10` - Navidad.

## What Should Not Be Migrated

- `payment_instances` should not become obligation definitions. They are
  historical cycle/payment state and should only be linked to generated
  `obligation_instances`.
- `quick_entries` should remain immutable ledger history.
- `accounts` should not migrate to obligations. Active spendable accounts need
  an explicit inclusion/exclusion flag before retirement decisions.
- Completed or already consolidated `planning_items` should stay in planning.
- Card payments should not migrate until the Cards domain confirms it needs an
  obligation lifecycle bridge.
- Dental ledger entries should not become obligations without confirmation that
  they are recurring.
- Fumigation/fumigador should not be migrated from live legacy data because no
  live row was found in the audited tables.

## Risks

- The current `obligations` table has evidence of old and new schema columns in
  the same table; rows must be normalized before relying on lifecycle outputs.
- `obligation_instances` and `obligation_payment_links` are empty, so Financial
  Engine parity will remain incomplete until instances and links are generated.
- Honda/Guagua and Hipoteca duplicates can double-count cash pressure if both
  sides are migrated independently.
- Due day versus grace/effective due day differs between liabilities and
  scheduled payments; generated instances need explicit rules.
- Planning rows already migrated from `future_obligations` can duplicate if
  Batch 5 inserts anything instead of treating those rows as keep/archive.

## Retirement Recommendation

After all batches pass parity checks, retire legacy route surfaces in this
order:

1. `/future-obligations`
2. `/payments`
3. `/payment-instances`
4. `/cashflow`
5. `/income`
6. `/accounts`
7. `/quick-entry`

Production navigation already avoids these pages, so route removal can happen
after data parity and any deep links are checked.
