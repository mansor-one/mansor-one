# Mansor One Production Security Audit

> Baseline snapshot from 2026-07-23, before Phase 1 application hardening.
> Findings C-1, C-2, H-1, H-3, H-5, M-1, M-2, and L-1 have local,
> not-yet-deployed mitigations documented in
> `SECURITY_PHASE1_IMPLEMENTATION.md`. Database/RLS and dependency findings
> remain open.

Date: 2026-07-23
Scope: repository, linked Supabase project, authentication, authorization, API routes, server actions, secrets, security headers, and dependencies.
Mode: audit and proposals only. No database migration or production-data mutation was performed.

## Executive summary

Mansor One has a strong RLS foundation on its active financial tables: every
public table has RLS enabled, the active household policies are limited to the
`authenticated` role, no live policy uses a literal `true`, and no live policy
is granted to `anon`. The application uses `auth.getUser()` or `getClaims()`
rather than trusting request-provided user identifiers.

The 16 Advisor findings are deny-by-default conditions, not current data
exposures. The linked database contains no rows in those tables, they have no
RLS policies, and neither `anon` nor `authenticated` has
`SELECT/INSERT/UPDATE/DELETE`. They should remain blocked until a product use
case establishes an ownership model.

Production readiness is still blocked by several application-layer issues:

1. The Google OAuth start/callback endpoints have no authenticated/admin
   boundary and no OAuth `state` validation.
2. Gmail/ATH import uses a global mailbox credential and a service-role client
   after checking only that the caller is authenticated. Any authenticated
   user could initiate ingestion from the shared mailbox into their lineage.
3. Cookie-authenticated mutation routes have no explicit Origin/CSRF check;
   one Gmail import mutation is exposed as `GET`.
4. No application security headers are configured.
5. Leaked Password Protection is disabled in Supabase Auth.
6. Existing household policies give ordinary household writers
   `UPDATE/DELETE` access to audit/event history that should be append-only.
7. Service-role construction is duplicated and the modules are not guarded
   with `server-only`.

## Evidence and method

- Inspected every `app/api/**/route.ts`, every server action, all page routes,
  `proxy.ts`, auth utilities, Supabase clients, Plaid/Gmail integrations,
  encryption helpers, generated database types, root migrations, active
  `supabase/migrations`, tests, Next configuration and dependency manifests.
- Queried the linked project read-only for `pg_policies`, RLS flags, grants,
  columns, functions, views and aggregate row counts.
- Read the current Supabase Security Advisor. It reports only:
  - 16 `rls_enabled_no_policy` informational findings.
  - Leaked Password Protection disabled.
- No view exists in `public` or `graphql_public`.
- Public functions are security invoker and not executable by `anon`.
- Private household authorization functions are security definer, have fixed
  search paths, are not executable by `anon`, and validate the caller through
  `auth.uid()`.

## Critical

### C-1: Shared Google OAuth flow lacks authentication, authorization and state

`/api/auth/google/start` and `/api/auth/google/callback` are excluded from the
page proxy and perform no session validation. The start endpoint creates an
OAuth authorization URL without `state`; the callback exchanges any supplied
authorization code without correlating it to an authenticated initiating
session.

Impact:

- OAuth login CSRF/confused-deputy behavior.
- Unauthorized consumption of the configured Google OAuth client.
- A future change that persists returned credentials would turn this into an
  account-binding vulnerability.

Required before production:

- Retire these legacy endpoints if the application uses a preconfigured Gmail
  refresh token.
- Otherwise require an authenticated allowlisted administrator, generate a
  cryptographically random state value, bind it to an HttpOnly SameSite cookie,
  validate it once in the callback, and use a fixed allowlisted redirect URI.

### C-2: Global Gmail credential is callable by any authenticated user

`/api/gmail/ath-import` validates a Supabase session, then uses one deployment-
wide `GOOGLE_REFRESH_TOKEN` and a service-role Supabase client. The caller does
not prove ownership of that mailbox or administrator status.

Impact:

- Any authenticated account can trigger reads from the household Gmail inbox.
- Imported ATH records are stamped with the caller's `user_id`.
- The globally unique Gmail message identifier can create cross-user overwrite
  or lineage-confusion behavior when service role bypasses RLS.

Required before production:

- Restrict the endpoint to an explicit internal administrator/household owner.
- Change the mutation to `POST`.
- Derive household and user lineage server-side.
- Never accept a mailbox, user ID or household ID from the request.
- Keep raw Gmail snippets out of normal responses and logs.

## High

### H-1: No explicit CSRF/Origin enforcement for financial mutations

Sensitive cookie-authenticated POST/PATCH endpoints rely on browser cookie
behavior and RLS, but do not reject foreign `Origin`/`Sec-Fetch-Site` values.
The Gmail import mutation currently uses `GET`.

Affected families include cards, obligations, Review Queue, ledger resolution,
 Plaid connection/sync and server actions.

Proposal: central `requireSameOriginMutation()` validation, POST-only mutations,
SameSite cookies, and regression tests for foreign origins.

### H-2: Audit/event history is writable and deletable by household members

The household policy generator grants all four operations to every table.
Consequently owners and members can update/delete:

- `obligation_reconciliation_events`
- `review_queue_resolution_events`
- `plaid_sync_runs`
- other historical lineage tables unless separately constrained

This does not create cross-household exposure, but it weakens financial audit
integrity. Event tables should normally allow household `SELECT`, controlled
`INSERT`, and no client `UPDATE/DELETE`. Plaid sync runs should be client
read-only and service-written.

### H-3: Service role is not centralized or bundle-guarded

Six construction sites use `SUPABASE_SERVICE_ROLE_KEY`; none imports
`server-only`. They are currently reached from server routes/modules, and no
client component imports the key, but an accidental future import could bundle
privileged code.

Proposal: one `lib/supabase/admin.ts` with `import 'server-only'`, environment
validation, `persistSession: false`, and no re-export from shared barrels.

### H-4: Leaked Password Protection is disabled

Enable it in Supabase Authentication settings. This is a console/configuration
change and is not contained in the SQL proposals.

### H-5: Internal diagnostic authorization fails open outside production

When `MANSOR_INTERNAL_ADMIN_EMAILS` is empty, `isAllowedAdminEmail()` returns
true. Production `/dev` is disabled and `/lab` requires a non-empty allowlist,
but preview/development deployments can expose sensitive Gmail and financial
diagnostics to any authenticated user.

Proposal: fail closed in preview and any remotely reachable environment; allow
the open behavior only for an explicitly local development mode.

## Medium

### M-1: Open redirect in ledger form responses

Ledger category-conflict and duplicate-resolution routes construct a redirect
from request-controlled `redirectTo` using `new URL()`. An authenticated caller
can supply an absolute external URL.

Use `getSafeRedirectPath()` and allow only same-origin relative paths.

### M-2: Proxy-only page protection is inconsistent

The proxy protects all non-API pages except `/login`, and most sensitive pages
also call `requireUser()`. Several routes rely solely on the proxy:

- `/imports`
- `/lab`
- `/advisor-v2`
- static dev fixture pages

`/lab/review-queue` and `/robototina/review` delegate to a shared component that
does call `requireUser()`, so they have defense in depth. Add direct guards to
any proxy-only page that reads or mutates sensitive data.

### M-3: User filters conflict with household authority

RLS correctly shares rows within a household, but many server queries add
`.eq('user_id', user.id)`. This usually narrows access safely; it can also make
the second household member see incomplete financial data. Do not remove these
filters globally. Replace them only after each feature decides whether
`user_id` is immutable lineage or row ownership.

### M-4: Plaid token model has a blocked legacy plaintext table

Active `plaid_connections` stores AES-256-GCM encrypted access tokens. The
legacy `plaid_items.access_token` column is plaintext, currently empty and
blocked. It must remain server-only and should never be reactivated. A later
destructive cleanup can be considered only under separate approval.

### M-5: Error handling is inconsistent

Most production routes return generic errors, but some routes return raw
Supabase/RPC error messages or caught exception messages. Normalize external
errors and retain detailed context only in redacted server logs.

### M-6: No rate limiting for expensive integrations

Plaid sync, Gmail reads, Robototina questions and import/reconciliation routes
have no per-user/household throttling. The Plaid orchestrator prevents overlap,
but it is not general abuse protection.

## Low

### L-1: No CSP or standard browser security headers

`next.config.ts` contains no headers. Proposed baseline:

- Content-Security-Policy with `frame-ancestors 'none'`
- Strict-Transport-Security in production
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy disabling unnecessary sensors
- X-Frame-Options: DENY as legacy defense

The CSP must be tested against Supabase, Plaid Link and Google endpoints before
enforcement.

### L-2: Dependency versions use ranges

The lockfile is committed, which makes installs reproducible with `npm ci`.
Direct dependencies still use caret ranges. Production should use automated
dependency review and lockfile-only installs. `npm audit` could not complete in
this environment because registry access timed out; this is an unresolved
validation item, not a clean result.

### L-3: Legacy zero-policy tables create operational noise

They are safe because they are blocked, but the Advisor warnings make real
regressions harder to see. Apply an explicit deny policy and revoke all client
privileges, or move/deprecate the tables later under separate approval.

## Common-risk review

| Risk | Result |
|---|---|
| XSS | No `dangerouslySetInnerHTML`, `eval`, `new Function`, or raw HTML sink found. React escaping is preserved. |
| CSRF | High concern for cookie-authenticated mutations; no explicit Origin validation. |
| SSRF | No request-controlled arbitrary fetch target found. Gmail, Google OAuth and Plaid targets are fixed. |
| SQL injection | No application string-built SQL found. Supabase query builders and fixed RPCs are used. Migration `format()` calls quote identifiers with `%I`. |
| Path traversal | No file-system path derived from request input found. |
| File upload/download | No active storage upload/download implementation found. `monthly_documents` stores metadata only. |
| Open redirect | Two authenticated ledger form routes accept absolute `redirectTo`. |
| Token leakage | No token logging found. Plaid detail pages select encrypted token fields server-side but render only booleans/status. |
| Webhooks | No webhook receiver found. Daily cron validates an exact bearer secret. |
| Encryption | Active Plaid tokens use AES-256-GCM with random 96-bit IV and auth tag. Key rotation/versioning is absent. |
| Secrets | No secret uses `NEXT_PUBLIC_`; Supabase URL and publishable/anon key are appropriately public. `.env.local` is ignored and untracked. |

## What is currently safe

- All public tables have RLS enabled.
- Active policies are household-scoped, authenticated-only and operation-
  specific.
- No live policy uses literal `true`; no live policy targets `anon`.
- The 16 zero-policy tables are empty and blocked from client data operations.
- Browser/server session clients use only the publishable/anon key.
- Active Plaid tokens are encrypted at rest by the application.
- Sensitive APIs generally derive the user from `auth.getUser()` and reject
  unauthenticated access.
- Cron sync requires `CRON_SECRET` and Plaid run IDs are scoped to the user.

## What is blocked by default

All 16 Advisor tables are blocked for both anonymous and authenticated data
access. `plaid_items` and the legacy catalogs are therefore not currently
exposed despite being in `public`.

## What could expose data

- The unauthenticated Google OAuth flow if expanded to persist credentials.
- Any authenticated user triggering the globally configured Gmail/ATH mailbox.
- A future accidental client import of a module that constructs service role.
- A future migration that grants household access to legacy tables before
  adding authoritative lineage.

## What could break functionality

- Applying the existing root
  `20260721_rls_missing_tables_classification.sql` would add household columns,
  grants and CRUD policies to unused legacy tables and could create a broader
  client surface than the current application needs.
- Removing `user_id` filters without converting lineage semantics could mix
  household records or break reconciliation.
- Enforcing CSP without first accommodating Plaid Link and Supabase endpoints
  could block authentication or bank linking.
- Restricting event-table writes without confirming every current insert path
  could break audit creation.

## Approval gates

Explicit approval is required before:

1. Applying either proposed SQL file.
2. Enabling deny policies/revoking residual privileges on the 16 tables.
3. Changing audit/event table privileges.
4. Changing Google OAuth or Gmail/ATH authorization behavior.
5. Centralizing service-role clients.
6. Adding CSRF enforcement or security headers.
7. Enabling Leaked Password Protection in the Supabase dashboard.
8. Any migration, backfill, token rotation, table move or legacy-table removal.

## Validation results

| Check | Result |
|---|---|
| TypeScript (`npx tsc --noEmit`) | Passed |
| Production build (`npm run build`) | Passed |
| ESLint (`npm run lint`) | Passed with 6 existing unused-code warnings in `ReviewQueueClient.tsx`; no errors |
| Tests (`npm test`) | Failed: 23 test files passed and `semi-monthly-spending.test.ts` failed because Node could not resolve the extensionless internal import `./categories` |
| `git diff --check` | Passed |
| Dependency audit | Incomplete: npm registry lookup timed out; no clean dependency result is claimed |

The test failure was not automatically changed because this sprint is
audit/proposal-only. It must be fixed and the full suite rerun before approving
security implementation.

See:

- [RLS_DECISION_MATRIX.md](./RLS_DECISION_MATRIX.md)
- [SERVICE_ROLE_USAGE.md](./SERVICE_ROLE_USAGE.md)
- [ROUTE_PROTECTION_AUDIT.md](./ROUTE_PROTECTION_AUDIT.md)
- [MANUAL_SECURITY_TEST_PLAN.md](./MANUAL_SECURITY_TEST_PLAN.md)
- [security/proposals/CODE_CHANGES.md](./security/proposals/CODE_CHANGES.md)
