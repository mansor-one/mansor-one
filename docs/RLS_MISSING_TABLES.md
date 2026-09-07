# RLS Hardening — missing-policy classification

## Live audit on 2026-07-21

The household migration is present in the live schema (`households` and financial `household_id` columns exist), although the migration-history connector returned no entries. Supabase Security Advisor no longer reports permissive policies. It reports 16 `rls_enabled_no_policy` findings and leaked-password protection disabled.

| Classification | Tables | Reason |
| --- | --- | --- |
| Household-scoped | `account_snapshots`, `ath_movil_matches`, `events`, `fixed_expenses`, `monthly_documents`, `raw_transactions`, `reminders`, `statement_imports`, `transactions`, `variable_income` | Household financial/history records; members of one household need shared access. |
| User-scoped | `pablo_questions` | Contains an explicit `user_id` and represents a personal question/answer history. |
| Server-only/internal | `ath_movil_rules`, `categories`, `plaid_category_rules`, `plaid_items`, `recommendations` | Internal rule/catalog/legacy surfaces. `plaid_items` contains access tokens and must never be client-readable. |

Only `categories` (19 rows), `ath_movil_rules` (11 rows), and `plaid_category_rules` (7 rows) currently contain data. They are classified server-only, so the migration does not backfill or alter their contents.

## Migration behavior

`20260721_rls_missing_tables_classification.sql`:

- derives household ownership from authoritative parent rows when possible;
- uses a singleton-household fallback only when exactly one household exists;
- aborts rather than guessing if any household row remains unresolved;
- adds indexed, non-null `household_id` and lineage triggers;
- creates separate household SELECT/INSERT/UPDATE/DELETE policies;
- keeps `pablo_questions` under `auth.uid()` and prevents `user_id` reassignment;
- revokes all client grants from internal tables;
- adds a restrictive service-role marker policy so Security Advisor can distinguish intentional server-only tables from forgotten policy work;
- fails if a public policy uses literal `true`, an external table lacks policies, an RLS table remains unclassified, or a server-only table retains client data grants.

## Smoke test before SQL

The local application started successfully. Unauthenticated checks returned:

| Route | Result |
| --- | --- |
| `/login` | HTTP 200 |
| `/`, `/accounts`, `/spending`, `/plaid`, `/ath-movil`, `/priorities`, `/goals`, `/timeline` | HTTP 307 to `/login?next=...` |

This verifies the login boundary and route availability but not authenticated data loading. For an authenticated session, `/accounts` now redirects to `/portfolio`; Dashboard, Portfolio, Spending/transactions, Plaid sync, ATH Móvil, Priorities, Goals and Obligations still require browser validation. Capture the exact browser console, network response, and server log if any page fails.

## Password protection

The Advisor confirms Leaked Password Protection is disabled. The available Supabase connector has no Auth-settings mutation API, so enable it manually in **Authentication → Settings → Security → Password Security** and rerun Security Advisor. Use a unique password-manager-generated password; add MFA in the next authentication hardening pass.

## Performance boundary

This sprint does not remove indexes reported as unused and does not batch unrelated FK-index work. New household indexes need representative traffic before usage statistics are meaningful.
