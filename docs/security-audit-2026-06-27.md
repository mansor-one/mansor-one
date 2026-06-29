# Mansor One Security Audit

Last updated: 2026-06-27

Scope: read-only audit of Supabase security, client usage, API routes, secrets exposure, and financial data integrity. No SQL, RLS, policies, schema, data, or production behavior were changed.

## Executive Summary

Mansor One has moved several critical areas toward the correct security model: `plaid_accounts`, `plaid_imports`, `plaid_connections`, `transaction_suggestions`, `transaction_review_items`, `transaction_rules`, `transaction_enrichments`, and `planning_items` are protected with RLS and owner-based policies. Newer API work such as Plaid account sync, Plaid import, and dev transaction intelligence uses the authenticated Supabase server client.

The main remaining risks are legacy database policies and legacy API routes:

- Several financial tables still use `USING (true)` or `WITH CHECK (true)`.
- Some tables grant privileges to `anon`, including financial tables.
- `planning_item_transactions` has RLS enabled but no policies, so it is currently inaccessible through RLS despite having authenticated grants.
- `quick_entries` has `user_id`, but its current policies do not enforce `auth.uid() = user_id`.
- Older API routes still use `SUPABASE_SERVICE_ROLE_KEY`, and some are unauthenticated.
- Google OAuth callback logs full token payloads.
- Several server pages still import the shared public `@/lib/supabase` client instead of using `createServerSupabase()` plus `requireUser()`.

## Phase 1 - Database Security

Evidence source: Supabase catalog queries against project `byjftcabsvaanswbmtzp` on 2026-06-27, including `pg_class`, `pg_policies`, `information_schema.columns`, `information_schema.role_table_grants`, `information_schema.table_constraints`, and Supabase security advisors.

### RLS Status

All public tables inspected have RLS enabled.

RLS disabled tables: none found in `public`.

Tables with RLS enabled and no policies:

- `account_snapshots`
- `ath_movil_matches`
- `ath_movil_rules`
- `categories`
- `events`
- `fixed_expenses`
- `household_members`
- `monthly_documents`
- `obligations`
- `pablo_questions`
- `people`
- `plaid_category_rules`
- `plaid_items`
- `planning_item_transactions`
- `raw_transactions`
- `recommendations`
- `reminders`
- `statement_imports`
- `transactions`
- `variable_income`

Risk: Low to High depending on table. RLS with no policy blocks normal Data API access, but it can break app functionality and cause developers to reach for service role. For `planning_item_transactions`, risk is High because the table is part of user financial planning and already has `user_id`.

Recommendation: Add owner-only policies where the table is user-owned; keep internal/system tables inaccessible unless there is a clear application path.

### Policies Using `USING (true)` or `WITH CHECK (true)`

High-risk policies:

| Table | Policy | Risk |
| --- | --- | --- |
| `ath_movil_messages` | insert/update/read use broad authenticated policies | High |
| `financial_links` | `Users can manage financial links` uses `USING true` and `WITH CHECK true` | High |
| `future_obligations` | insert/update/read broad authenticated policies | High |
| `income_schedule` | insert/update/read broad authenticated policies | High |
| `payment_instances` | insert/update/read broad, read includes anon/authenticated | High |
| `priorities` | insert/update/read broad authenticated policies | Medium |
| `quick_entries` | insert/read/update broad authenticated policies | Critical |

Additional broad read policies:

- `asset_maintenance`
- `assets`
- `credit_cards`
- `funds`
- `goals`
- `liabilities`
- `merchant_rules`
- `scheduled_payments`

Recommendation: Replace broad policies on user financial tables with explicit owner predicates. Do not use `USING (true)` or `WITH CHECK (true)` for user-owned financial data.

### Policies Allowing `anon`

Tables with policies that include `anon`:

- `assets`
- `credit_cards`
- `funds`
- `goals`
- `merchant_rules`
- `payment_instances`
- `scheduled_payments`

Risk: High for `credit_cards`, `payment_instances`, and `scheduled_payments`; Medium for legacy informational tables depending on whether data is sensitive.

Recommendation: Revoke anon Data API access for all financial tables. If public reference data is needed later, isolate it into explicit system/reference tables with non-sensitive content.

### Grants to `anon` and `authenticated`

The catalog shows broad grants on many tables. Important examples:

- `accounts`: anon has `SELECT` and `UPDATE`; authenticated has `SELECT` and `UPDATE`.
- `credit_cards`: anon has `SELECT`.
- `plaid_imports`: anon has `SELECT`; authenticated has `SELECT`, `INSERT`, and `UPDATE`.
- `payment_instances`: anon has `SELECT`, `INSERT`, and `UPDATE`.
- `quick_entries`: anon has `SELECT` and `INSERT`; authenticated has `SELECT`, `INSERT`, and `UPDATE`.
- Many tables grant `REFERENCES`, `TRIGGER`, and `TRUNCATE` to anon/authenticated.

Risk: High. RLS can still prevent row access, but table-level grants to anon create unnecessary attack surface. `TRUNCATE` is especially inappropriate for browser-facing roles.

Recommendation: Revoke all unnecessary anon grants from financial tables. Limit authenticated grants to the exact operations required by RLS-protected app flows.

### Tables With `user_id`

Financial/security-relevant tables with `user_id`:

- `accounts`
- `credit_cards`
- `plaid_accounts`
- `plaid_connections`
- `plaid_imports`
- `planning_items`
- `planning_item_transactions`
- `quick_entries`
- `transaction_suggestions`
- `transaction_review_items`
- `transaction_rules`
- `transaction_enrichments`
- `ath_movil_emails`
- `financial_goals`

Financial tables without `user_id`:

- `income_schedule`
- `scheduled_payments`
- `payment_instances`
- `liabilities`
- `assets`
- `asset_maintenance`
- `funds`
- `goals`
- `future_obligations`
- `priorities`
- legacy transaction tables: `transactions`, `raw_transactions`, `statement_imports`

Risk: High for active financial tables without `user_id`, because they require broad policies or owner-text filtering outside RLS.

Recommendation: Migrate active financial tables to `user_id` before making them first-class multi-user surfaces.

### Planning Model Verification

`planning_items` is correct:

- Has `user_id`.
- RLS enabled.
- Policies are authenticated only.
- Policies enforce `auth.uid() = user_id` for select, insert, update, and delete.

`planning_item_transactions` is not complete:

- Has `user_id`.
- RLS enabled.
- Grants exist for authenticated `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.
- No RLS policies exist.

Risk: High for functionality and future security. The table cannot safely be used until owner-only policies exist.

Recommendation: First safe database fix: add authenticated owner-only policies for `planning_item_transactions` using `auth.uid() = user_id`.

## Phase 2 - Supabase Client Usage

### Requested Pages

`app/page.tsx`

- Uses `requireUser()` and receives `supabase, user`.
- Filters recent `quick_entries` by `.eq('user_id', user.id)`.
- Evidence: `app/page.tsx` lines 1, 25, 35.
- Risk: Low.

`app/planning/page.tsx`

- Uses `requireUser()`.
- Queries `planning_items` without an explicit `.eq('user_id', user.id)`.
- Because RLS on `planning_items` is owner-only, this is not a data leak, but the page should still filter by `user_id` for clarity and query efficiency.
- Evidence: `app/planning/page.tsx` lines 1, 8-14.
- Risk: Low.

`app/dev/merchant-knowledge/page.tsx`

- Uses `createServerSupabase()` and `requireUser(supabase)`.
- Filters both `plaid_imports` and `quick_entries` by `user_id`.
- Evidence: `app/dev/merchant-knowledge/page.tsx` lines 181-199.
- Risk: Low.

### Server Components Using Shared Public Client

These server pages import `@/lib/supabase` and should be reviewed for migration to `createServerSupabase()` plus `requireUser()` where they display user or financial data:

- `app/cashflow/page.tsx`
- `app/assets/page.tsx`
- `app/priorities/page.tsx`
- `app/payments/page.tsx`

Evidence: `app/cashflow/page.tsx` lines 1-13 show a server component using the shared public client for `scheduled_payments` and `income_schedule`.

Risk: Medium to High depending on table. These pages rely on broad legacy RLS and anon grants.

Recommendation: Migrate server financial pages to authenticated server client. For legacy tables without `user_id`, keep behavior stable while planning schema migration.

### Client Components Using Public Client

These pages/components are client-side and can use the public/browser client if RLS is correct:

- `app/income/page.tsx`
- `app/quick-entry/page.tsx`
- `app/goals/page.tsx`
- `app/imports/page.tsx`
- `app/payment-instances/page.tsx`
- `app/accounts/page.tsx`
- `app/plaid-import/page.tsx`
- `app/merchant-rules/page.tsx`
- `app/advisor/page.tsx`
- `app/plaid/ConnectPlaidButton.tsx`
- dev buttons under `app/dev`

Risk: Medium until table policies are fixed. Client-side usage is acceptable only when RLS and grants are tight.

Recommendation: Do not treat client public client usage itself as a bug. Fix RLS/grants first, then migrate client pages that should be server-rendered.

## Phase 3 - API Route Security

### Routes With Good Auth Pattern

- `app/api/plaid/create-link-token/route.ts`: checks `supabase.auth.getUser()`.
- `app/api/plaid/accounts/route.ts`: uses `createServerSupabase()` plus `requireUser()`.
- `app/api/plaid/import-transaction/route.ts`: checks `supabase.auth.getUser()`, reads/writes scoped by `user_id`.
- `app/api/plaid/sync-accounts/route.ts`: checks `supabase.auth.getUser()`, reads/writes scoped by `user_id`.
- `app/api/dev/transaction-intelligence/generate-plaid-suggestions/route.ts`: checks session and uses `user_id`.
- `app/api/dev/transaction-intelligence/recategorize-plaid-suggestions/route.ts`: checks session and uses `user_id`.
- `app/api/pablo/answer/route.ts`: checks session before answering.

Risk: Low to Medium. Continue to ensure every write uses explicit `user_id` predicates.

### Routes Requiring Attention

Critical:

- `app/api/plaid/transactions/route.ts`
  - No authentication check.
  - Uses service role.
  - Reads latest 100 `plaid_imports` without `user_id` filtering.
  - Evidence: lines 2-17.
  - Recommendation: remove or protect. If kept, use `createServerSupabase()`, `auth.getUser()`, and `.eq('user_id', user.id)`.

High:

- `app/api/plaid/sync-imports/route.ts`
  - No authentication check.
  - Uses service role.
  - Reads all `plaid_connections`.
  - Writes `plaid_imports` for all users.
  - Evidence: lines 7-10, 27-33, 93-119.
  - Recommendation: convert to authenticated per-user sync, or move to a locked internal cron endpoint with explicit secret verification and careful server-only controls.

- `app/api/gmail/ath-import/route.ts`
  - No session auth.
  - Uses service role.
  - Uses `MANSOR_USER_ID` env var to write user rows.
  - Evidence: service-role setup and upsert into `ath_movil_emails`.
  - Recommendation: make this an authenticated user action or an internal job protected by an explicit server-only secret. Avoid hard-coded user env routing long term.

- `app/api/plaid/exchange-public-token/route.ts`
  - Authenticates user but uses service role to insert `plaid_connections`.
  - Evidence: lines 3-7, 37-66.
  - Recommendation: use authenticated Supabase client and RLS insert policy instead of service role.

- `app/api/plaid/connections/route.ts`
  - Authenticates user and filters by `user_id`, but uses service role for read.
  - Evidence: lines 2-7, 12-24.
  - Recommendation: use authenticated Supabase client unless a server-only field must be read. Do not select token fields.

High secret/logging issue:

- `app/api/auth/google/callback/route.ts`
  - Logs full Google OAuth tokens.
  - Evidence: line 28.
  - Recommendation: never log tokens. Store securely or return only a safe success state.

Medium:

- `app/api/gmail/test/route.ts` and `app/api/gmail/ath-parse/route.ts`
  - No auth.
  - Use Gmail refresh token from env and return email snippets/parsed content.
  - Recommendation: restrict to authenticated dev/admin or remove from production routes.

- `app/api/auth/google/start/route.ts`
  - No app auth. It starts OAuth flow.
  - Recommendation: acceptable only if this remains a controlled admin/dev flow; otherwise require session before starting.

## Phase 4 - Secrets

Unsafe or risky patterns found:

- `SUPABASE_SERVICE_ROLE_KEY` used in app routes:
  - `app/api/plaid/exchange-public-token/route.ts`
  - `app/api/plaid/connections/route.ts`
  - `app/api/plaid/transactions/route.ts`
  - `app/api/plaid/sync-imports/route.ts`
  - `app/api/gmail/ath-import/route.ts`
- `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN` are used in server routes. This is acceptable only if routes are protected.
- `app/api/auth/google/callback/route.ts` logs token payloads.
- `PLAID_SECRET` is used server-side only in inspected Plaid routes.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are used in client/server Supabase clients. This is expected.

No direct evidence found of service role, Plaid secret, OpenAI key, Gmail token, or Google secret being imported into a client component. The bigger issue is unprotected server routes that can invoke those secrets.

Recommendation: remove service-role usage from user APIs first. Then protect or delete Gmail/test routes. Remove token logging immediately.

## Phase 5 - Financial Data Integrity

### Constraints Found

Existing unique constraints:

- `plaid_accounts_plaid_account_id_key` on `plaid_accounts(plaid_account_id)`.
- `plaid_imports_plaid_transaction_id_key` on `plaid_imports(plaid_transaction_id)`.

Primary keys exist on reviewed financial tables.

Foreign keys found:

- `accounts.user_id`
- `credit_cards.user_id`
- `plaid_imports.user_id`
- `planning_items.user_id`
- `planning_item_transactions.user_id`
- `quick_entries.user_id`
- `payment_instances.scheduled_payment_id`

### Missing or Risky Integrity Controls

Critical:

- `quick_entries` has `user_id`, but policies use `true`. Cross-user read/update/insert is possible for authenticated users through the Data API if grants allow it.
- `payment_instances` has no `user_id` and broad insert/update/read policies.

High:

- `planning_item_transactions` has no RLS policies despite authenticated write grants.
- `income_schedule` has no `user_id` and broad insert/update/read policies.
- `scheduled_payments` has no `user_id` and anon-readable policy.
- `credit_cards` has `user_id`, but current policy allows anon/authenticated read with `USING true`.
- `liabilities` has no `user_id` and broad public read.

Medium:

- `accounts` has owner policies, but anon still has table-level SELECT/UPDATE grants. RLS currently prevents anon because policies are authenticated-only, but the grants are unnecessary.
- `plaid_imports.plaid_transaction_id` unique is global. This is usually fine for Plaid transaction IDs, but long-term multi-user safety may prefer uniqueness on `(user_id, plaid_transaction_id)` if Plaid IDs are not guaranteed globally unique across items.
- `plaid_accounts.plaid_account_id` unique is global. This matches current design as requested, but document the assumption that Plaid account IDs are globally unique enough for this app.
- `quick_entries.plaid_transaction_id` has a unique constraint based on observed prior error behavior, but it did not appear in the information_schema constraint query. Verify the backing index definition before relying on it in migration planning.

Low:

- Legacy tables like `assets`, `funds`, `goals`, `priorities`, and `future_obligations` are mixed between public/demo-style data and financial planning data. Their ownership model should be clarified before further feature work.

### Duplicate Risks

- `payment_instances`: no unique constraint preventing duplicate scheduled payment/month/year rows.
- `income_schedule`: no `user_id`; duplicate active income rows are possible.
- `scheduled_payments`: no `user_id`; duplicate recurring payment definitions are possible.
- `quick_entries`: duplicate Plaid import protection exists in application logic and likely a database uniqueness mechanism, but constraint visibility should be verified.
- `planning_item_transactions`: no owner policies; integrity is blocked more by RLS incompleteness than duplication constraints.

Recommended future constraints:

- `payment_instances(scheduled_payment_id, payment_month, payment_year)` unique after data cleanup.
- `plaid_imports(user_id, plaid_transaction_id)` unique if changing from global Plaid ID model.
- `quick_entries(user_id, plaid_transaction_id)` partial unique where `plaid_transaction_id is not null`.
- `planning_item_transactions` should enforce ownership consistency between `user_id` and related planning items, either with application checks first or a future trigger/function once the model settles.

## Findings

### Finding 1 - Broad RLS on `quick_entries`

Risk: Critical

Evidence: Supabase policy query shows:

- `Users can insert own quick entries` uses `WITH CHECK true`.
- `Users can read own quick entries` uses `USING true`.
- `Users can update own quick entries` uses `USING true`.

Recommendation: Replace with authenticated owner-only policies using `auth.uid() = user_id`; add `WITH CHECK auth.uid() = user_id` for insert/update.

Suggested fix plan: prioritize after removing dangerous unauthenticated service-role endpoints, because this is core ledger data.

### Finding 2 - Unauthenticated Plaid transactions API leaks imports

Risk: Critical

Evidence: `app/api/plaid/transactions/route.ts` lines 4-17 uses service role and reads `plaid_imports` without auth or `user_id`.

Recommendation: Remove route if obsolete. Otherwise require session and filter by `user_id`.

Safe first fix: disable or protect this route.

### Finding 3 - Unauthenticated Plaid sync imports processes all connections

Risk: High

Evidence: `app/api/plaid/sync-imports/route.ts` lines 7-10 uses service role; lines 29-33 read all `plaid_connections`; lines 93-119 write imports.

Recommendation: Convert to authenticated per-user sync using RLS. If it must be a job, protect with a server-only cron secret and do not expose it as a normal browser-callable route.

### Finding 4 - Google OAuth callback logs tokens

Risk: High

Evidence: `app/api/auth/google/callback/route.ts` line 28 logs `GOOGLE TOKENS`.

Recommendation: Remove token logging. Never return or log refresh/access tokens.

Safe first fix: remove the log and return only a safe status.

### Finding 5 - Service role used in user-facing API routes

Risk: High

Evidence:

- `app/api/plaid/exchange-public-token/route.ts` lines 22-24.
- `app/api/plaid/connections/route.ts` lines 4-7.
- `app/api/plaid/transactions/route.ts` lines 4-7.
- `app/api/plaid/sync-imports/route.ts` lines 7-10.
- `app/api/gmail/ath-import/route.ts` service-role setup.

Recommendation: Remove service role from user-scoped routes. Use `createServerSupabase()` and RLS. Reserve service role for internal jobs that are not directly callable by untrusted users and have explicit authorization.

### Finding 6 - `planning_item_transactions` has no RLS policies

Risk: High

Evidence: Supabase advisor reports `public.planning_item_transactions` has RLS enabled but no policies; catalog confirms the table has `user_id` and authenticated grants.

Recommendation: Add authenticated owner-only select/insert/update/delete policies.

Safe first fix: implement policies only, no app behavior change.

### Finding 7 - Legacy payment/income tables lack `user_id`

Risk: High

Evidence: Catalog columns show no `user_id` on `income_schedule`, `scheduled_payments`, and `payment_instances`.

Recommendation: Keep current app behavior stable, but plan a migration to add `user_id`, backfill, add owner policies, then update pages/engines.

### Finding 8 - Server pages still use shared public client

Risk: Medium

Evidence: `app/cashflow/page.tsx` lines 1-13; similar imports found in `app/assets/page.tsx`, `app/priorities/page.tsx`, and `app/payments/page.tsx`.

Recommendation: Migrate server financial pages to `createServerSupabase()` plus `requireUser()` where user financial data is shown.

### Finding 9 - Broad anon grants remain

Risk: High

Evidence: Grants query shows anon privileges on active financial tables including `accounts`, `credit_cards`, `plaid_imports`, `payment_instances`, `quick_entries`, and `scheduled_payments`.

Recommendation: Revoke anon grants from financial tables. Keep no anon financial access.

### Finding 10 - Supabase Auth leaked password protection disabled

Risk: Medium

Evidence: Supabase security advisor reported `auth_leaked_password_protection`.

Recommendation: Enable leaked password protection in Supabase Auth settings.

## Suggested Fix Plan

### Safe to Implement First

1. Remove token logging from `app/api/auth/google/callback/route.ts`.
2. Protect or remove `app/api/plaid/transactions/route.ts`.
3. Add owner-only RLS policies for `planning_item_transactions`.
4. Tighten `quick_entries` policies to `auth.uid() = user_id`.
5. Revoke anon grants from `quick_entries`, `plaid_imports`, `credit_cards`, `payment_instances`, and `scheduled_payments`.
6. Convert `app/api/plaid/exchange-public-token/route.ts` and `app/api/plaid/connections/route.ts` away from service role.
7. Protect or remove Gmail test/parse/import endpoints.

### Next Layer

1. Migrate `payment_instances`, `scheduled_payments`, and `income_schedule` to `user_id`.
2. Replace broad RLS on payment/income tables with owner-only policies.
3. Migrate server financial pages away from the shared public Supabase client.
4. Add duplicate-prevention constraints after data cleanup.
5. Decide which legacy public/demo tables are still product data and either lock them down or archive them.

## Items Intentionally Not Changed

- No SQL was modified.
- No RLS policies were changed.
- No grants were changed.
- No database schema or data was changed.
- No API behavior was changed.
- No production routes were modified.
