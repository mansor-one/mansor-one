# Mansor One Security Hardening — Phase 1 Implementation

Date: 2026-07-24
Branch: `security/phase-1-hardening`
Status: implemented locally; not merged, deployed, or applied to Supabase.

## Implemented controls

### Shared Gmail manager boundary

The shared Gmail credential is now controlled by one reusable server
authorization function:
`lib/auth/require-household-gmail-manager.ts`.

The exact rule is:

1. Supabase `auth.getUser()` must validate a current user.
2. The application queries `household_members` using that user's
   `auth_user_id`.
3. Membership must be active, have a non-null `household_id`, and have
   `role = 'owner'`.
4. `member`, `viewer`, inactive, missing, and lookup-error cases fail closed
   with 403.

No user ID, household ID, mailbox address, or administrator flag is accepted
from a request.

### Google OAuth

- Start and callback require the Gmail manager rule.
- Start generates 32 random bytes for `state`.
- A signed payload binds nonce, user ID, operation, issue time, and expiry.
- The payload lives in a short-lived HttpOnly, SameSite=Lax cookie scoped to
  the callback path and is Secure in production.
- Callback clears the cookie before token exchange, then validates signature,
  state, user, operation, and expiry with constant-time comparisons.
- Provider errors and successful completion redirect only to fixed internal
  paths.
- Codes, access tokens, refresh tokens, and provider payloads are not logged or
  returned.

The existing callback still does not persist returned tokens. Phase 1 preserves
that behavior because adding or migrating OAuth token storage was explicitly
outside scope.

### Gmail endpoints

| Route | Phase 1 behavior |
|---|---|
| `GET /api/auth/google/start` | Valid session + active household owner; creates bound OAuth state. |
| `GET /api/auth/google/callback` | Same owner + one-time state before token exchange. |
| `POST /api/gmail/ath-import` | Valid Origin + active household owner; server-derived user/household lineage; idempotent Gmail-ID upsert. |
| `GET /api/gmail/ath-import` | No handler; Next returns 405. |
| `GET /api/gmail/test` | Internal allowlist + household owner; output no longer includes snippets/headers. |
| `GET /api/gmail/ath-parse` | Internal allowlist + household owner. |
| `GET /api/gmail/ath-test` | Internal allowlist + household owner; no token-storage instruction. |

No Gmail status, disconnect, scheduled-import, or webhook route exists in the
current repository.

### Privileged Supabase client

`lib/supabase/admin.ts` is the only construction site for the service-role
client. It:

- imports `server-only`;
- validates required environment variables;
- never exports the key;
- disables session persistence and token refresh.

Plaid user routes authenticate before calling the privileged client. The daily
sync route validates exact `Bearer CRON_SECRET` before construction.
`/api/plaid/connections` no longer needs service role and uses the caller's
server client plus RLS.

### Origin/CSRF boundary

`lib/security/request-origin.ts` protects financial and integration mutations.
It uses only explicit sources:

- `MANSOR_ALLOWED_ORIGINS`;
- `NEXT_PUBLIC_APP_URL`;
- Vercel's system-provided production and deployment URLs;
- localhost/127.0.0.1 only in development.

Production and preview reject a missing Origin. Malformed, foreign, or
`Sec-Fetch-Site: cross-site` requests receive 403. Development permits missing
Origin only when it is not marked cross-site, to preserve local non-browser
testing.

Exemptions:

- `GET /api/plaid/sync/daily` uses an exact bearer cron secret.
- Google OAuth callback uses one-time state rather than browser mutation
  Origin.
- `POST /api/robototina/answer` is a read-only question endpoint.
- retired `pablo` handlers return 410 and perform no mutation.

Next Server Actions keep Next's built-in Origin/Host validation and their
existing direct `requireUser()` checks; this phase did not replace Next's
protocol with a duplicate application wrapper.

### Safe redirects

`lib/security/safe-redirect.ts` permits only one-origin relative paths and
preserves valid query/hash components. It rejects absolute and scheme-relative
URLs, backslashes, control characters, malformed encoding, and encoded or
double-encoded bypasses. Both ledger form mutation routes now use it.

### Diagnostics

An empty `MANSOR_INTERNAL_ADMIN_EMAILS` allowlist now denies access in preview
and development. Production remains disabled by default; the existing explicit
Lab production flag and non-empty allowlist remain required.

### Direct page auth

`/imports` and `/lab` now call `requireUser()` in their page components, while
the proxy remains defense in depth.

### Security headers

`next.config.ts` adds:

- enforced Content-Security-Policy;
- Strict-Transport-Security in production;
- X-Content-Type-Options;
- Referrer-Policy;
- Permissions-Policy;
- `frame-ancestors 'none'` plus X-Frame-Options DENY.

CSP sources are limited to self, the configured Supabase HTTPS/WSS origin, and
explicit Plaid Link/API origins. `unsafe-inline` remains for scripts/styles
because nonce CSP in Next 16 requires forcing dynamic rendering across the
application; that larger rendering change is not safe in this phase. There are
no wildcard sources and no `unsafe-eval`.

## Deliberately not implemented

- No RLS, grant, schema, migration, financial calculation, or production data
  change.
- No token rotation or OAuth token persistence migration.
- No new provider, role, UI, cache, worker, webhook, or rate limiter.
- Audit event policies remain a proposal. Reconciliation/review events should
  become append-only in a later approved RLS phase; `plaid_sync_runs` must
  remain mutable by its server orchestrator.
- Supabase Leaked Password Protection remains a manual Dashboard action.

## Environment variables

Existing required secrets remain unchanged:

- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_REFRESH_TOKEN`
- `CRON_SECRET`

Security configuration:

- `MANSOR_ALLOWED_ORIGINS`: comma-separated exact application origins.
- `MANSOR_INTERNAL_ADMIN_EMAILS`: non-empty exact diagnostic-admin emails.
- `NEXT_PUBLIC_APP_URL`: existing public canonical application origin, if used.

No secret uses a `NEXT_PUBLIC_` prefix.

## Known limitations and deployment risks

1. Plaid Link and login/Gmail OAuth require browser smoke tests under the
   enforced CSP before deployment.
2. CSP still allows inline script/style for Next compatibility; nonce CSP is a
   future hardening item.
3. Changing Gmail import from GET to POST intentionally breaks any unknown
   external script using GET; repository search found no caller.
4. The one global Gmail refresh token remains deployment configuration, not
   per-household credential storage.
5. No rate limiting was added in this phase.

## Exact Phase 1 code files

New shared boundaries:

- `lib/auth/gmail-manager-policy.ts`
- `lib/auth/require-household-gmail-manager.ts`
- `lib/gmail/client.ts`
- `lib/security/oauth-state.ts`
- `lib/security/request-origin.ts`
- `lib/security/safe-redirect.ts`
- `lib/supabase/admin.ts`

Updated shared/configuration code:

- `lib/auth/internal-tools.ts`
- `lib/auth/redirects.ts`
- `lib/plaid-sync/orchestrator.ts`
- `lib/security/encryption.ts`
- `next.config.ts`

Updated application routes/pages:

- `app/api/auth/google/callback/route.ts`
- `app/api/auth/google/start/route.ts`
- all four `app/api/cards/*/route.ts` files
- both `app/api/dev/transaction-intelligence/*/route.ts` files
- all four `app/api/gmail/*/route.ts` files
- all three `app/api/ledger/*/route.ts` files
- `app/api/obligations/confirm-paid/route.ts`
- `app/api/obligations/reconciliation-candidate/route.ts`
- `app/api/plaid/connections/route.ts`
- `app/api/plaid/create-link-token/route.ts`
- `app/api/plaid/exchange-public-token/route.ts`
- `app/api/plaid/import-transaction/route.ts`
- `app/api/plaid/revoke-connection/route.ts`
- `app/api/plaid/sync-accounts/route.ts`
- `app/api/plaid/sync-imports/route.ts`
- `app/api/plaid/sync/daily/route.ts`
- `app/api/plaid/sync/route.ts`
- all four `app/api/review-queue/*/route.ts` files
- `app/imports/page.tsx`
- `app/lab/page.tsx`

Tests/mechanical correction:

- `tests/security-phase1.test.ts`
- `lib/financial-engine/semi-monthly-spending.ts`

Documentation created or updated:

- `SECURITY_PHASE1_EVIDENCE.md`
- `SECURITY_PHASE1_IMPLEMENTATION.md`
- `SECURITY_ROUTE_MATRIX.md`
- `SECURITY_PHASE1_TEST_RESULTS.md`
- `SECURITY_PHASE1_PRODUCTION_CHECKLIST.md`
- `SECURITY_PHASE1_ROLLBACK.md`
- `SECURITY_AUDIT.md`
- `SERVICE_ROLE_USAGE.md`
- `ROUTE_PROTECTION_AUDIT.md`
- `security/proposals/CODE_CHANGES.md`
