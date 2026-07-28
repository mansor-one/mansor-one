# Mansor One Security Hardening — Phase 1 Evidence

Date: 2026-07-24
Branch: `security/phase-1-hardening`
Mode: evidence before implementation. No migration was applied and no production
record was read or changed for this document.

## Authorization model used by this phase

The existing household model has a reliable server-verifiable role:
`household_members.role` is constrained to `owner`, `member`, or `viewer`
(`migrations/20260721_household_authorization_foundation.sql:20-29`), membership
is tied to `auth_user_id`, and inactive memberships are excluded by the existing
authorization functions (`:90-135`). Phase 1 therefore defines the manager of
the one deployment-wide Gmail mailbox as an active household **owner**. Members
and viewers are not Gmail managers. This does not change household financial
access rules and does not create a new role.

## Finding-by-finding evidence

| ID | Finding and exact evidence | Current boundary | Concrete misuse and data | Severity | Targeted fix | Regression risk | Required regression test |
|---|---|---|---|---|---|---|---|
| P1-01 | Google OAuth start is insufficiently protected. `app/api/auth/google/start/route.ts:3-15` creates the authorization URL without reading a session, checking a household role, or adding `state`. | None; `/api` is excluded from `proxy.ts:8-11`. | Any caller can initiate the configured Gmail OAuth flow. The route exposes no secret, but it can be used as an OAuth login-CSRF/confused-deputy entry point. | Critical | Require a validated Supabase user and active household owner before generating the URL. Derive the manager identity from the session. | A non-owner who previously used the route will receive 403. | Anonymous 401; member/viewer 403; owner receives a Google redirect containing a random state. |
| P1-02 | Google callback state is inadequate. `app/api/auth/google/callback/route.ts:3-32` accepts any `code`, exchanges it, and never validates a session, owner role, state, expiry, or one-time use. | Presence of a `code` only. | An unsolicited/mismatched code can consume the configured Google client. If tokens are persisted later this becomes account-binding compromise. | Critical | One-time random state bound to user ID and operation in a signed, short-lived, HttpOnly, SameSite=Lax cookie; constant-time comparisons; consume before exchange; safe errors. | Incorrect cookie scope or SameSite may break the legitimate callback. | Missing, malformed, expired, reused, wrong-state, and different-user cases fail; valid owner flow succeeds; provider error is safe. |
| P1-03 | Global Gmail import is callable by any authenticated user. `app/api/gmail/ath-import/route.ts:130-136` only calls `requireApiUser`; `:11-25` uses the deployment refresh token; `:149-155` and `:190-196` use service role; `:171-177` stamps the caller's user ID. | Any authenticated user. Mutation is exposed as GET. | A member/viewer or user in another household can trigger reads of the shared mailbox and privileged ingestion. Responses can expose provider/database error payloads (`:146-155`, `:195-209`). | Critical | POST only; require active household owner before Gmail or admin-client access; derive lineage server-side; return counts and stable errors only. | Existing bookmarks or scripts using GET will stop importing; this is intentional. | GET is non-mutating/405; anonymous 401; non-owner 403; owner import stays idempotent by Gmail message ID. |
| P1-04 | Service clients are duplicated. Direct `SUPABASE_SERVICE_ROLE_KEY` construction exists in `app/api/plaid/exchange-public-token/route.ts:22-25`, `app/api/plaid/connections/route.ts:5-8`, `app/api/plaid/sync-imports/route.ts:11-14`, `app/api/gmail/ath-import/route.ts:6-9`, `app/api/plaid/sync/daily/route.ts:8`, and `lib/plaid-sync/orchestrator.ts:26-28`. | Module placement only. | A future client import can accidentally pull privileged construction into a browser graph; route-level instances are created before request authorization. | High | A single `lib/supabase/admin.ts` with `import 'server-only'`, validated environment, no key export, and `persistSession: false`; construct/use only after auth or cron verification. | `server-only` can expose an accidental client dependency during build, which is a desired failure. | Static test: service key referenced only by canonical module; no client component imports it; unauthorized request exits before privileged call. |
| P1-05 | There is no explicit server-only boundary for privileged integration modules. The six sites above import `@supabase/supabase-js` directly and none imports `server-only`. | Convention only. | Refactors can bundle privileged helpers into client code. | High | Guard canonical admin, Gmail credential/OAuth helpers, Plaid worker/orchestrator, and encryption helper where compatible. | Node-only unit imports may need to test pure helpers separately. | Build succeeds and a static import-boundary assertion passes. |
| P1-06 | Cookie-authenticated mutation routes have no central Origin/CSRF validation. The repository exposes POST/PATCH mutations in cards, ledger, obligations, Plaid, and Review Queue (route inventory in `ROUTE_PROTECTION_AUDIT.md`), while the Gmail import mutates over GET. | Session/RLS on most routes; browser SameSite behavior only. | A cross-site request can attempt financial or integration mutations with ambient cookies. | High | Central mutation-origin validator using configured origins and trusted Vercel environment origins; reject malformed/foreign origins; fail closed in production/preview; exempt only bearer-authenticated cron/provider callbacks. | Missing-Origin non-browser clients need a documented trusted strategy. | Production, preview, local, malicious, malformed, and missing-Origin tests; static route coverage gate. |
| P1-07 | Audit/reconciliation history can be mutable under the generic household policy migration. `migrations/20260721_rls_household_policies.sql:62-75` includes `obligation_reconciliation_events`, `plaid_sync_runs`, and `review_queue_resolution_events` in a four-operation policy generator. Application code only inserts reconciliation/review events (`app/api/obligations/confirm-paid/route.ts:148-181`, `app/api/obligations/reconciliation-candidate/route.ts:51-110`, `app/api/review-queue/resolve-duplicate/route.ts:178-268`); the orchestrator legitimately updates run-state rows (`lib/plaid-sync/orchestrator.ts:39-111`). | Household owner/member write policy. | A household writer could update/delete historical event rows through the Data API, weakening audit integrity. `plaid_sync_runs` is operational state, not strictly append-only. | High | Do not change SQL in Phase 1. Keep the reviewed append-only proposal outside migrations and distinguish immutable events from mutable operational run state. Corrections remain new events. | Applying a blanket append-only rule to `plaid_sync_runs` would break sync. | Proposal-only assertions; approval and DB authorization tests are deferred to an RLS phase. |
| P1-08 | Diagnostics fail open in preview when no allowlist exists. `lib/auth/internal-tools.ts:38-41` treats an empty allowlist as allowed; `:70-78` therefore lets any authenticated preview user through. `app/api/gmail/test/route.ts:42-60` returns Gmail metadata and `app/api/gmail/ath-parse/route.ts:125-153` returns parsed message data. `app/api/gmail/ath-test/route.ts:3` is public. | Production disabled; preview/development may be open. | Any authenticated preview user can read sensitive Gmail diagnostic output; one static diagnostic is public. | High | Empty allowlist denies everywhere; Gmail diagnostics also require active household owner; unnecessary diagnostics return 404 outside approved environments; responses redact provider detail. | Local developers must configure an explicit admin email. | Empty preview allowlist denies; allowlisted owner succeeds only in enabled environment; ordinary user denied; public static diagnostic removed/guarded. |
| P1-09 | Ledger form redirects accept absolute URLs. `app/api/ledger/category-conflict/route.ts:78-88` and `app/api/ledger/duplicate-resolution/route.ts:73-87` pass request-controlled `redirectTo` directly to `new URL`. | Authentication happens before mutation, but redirect target is not constrained. | Authenticated attacker can submit an absolute external redirect and send the browser off-site after a financial action. | Medium | Reusable strict relative redirect helper; reject scheme-relative, absolute, backslash, control-character, encoded and double-encoded bypasses. | Overly strict parsing could reject legitimate internal query strings. | Valid relative paths/queries preserved; unsafe schemes, `//`, backslashes and encoded bypasses fall back safely. |
| P1-10 | Some pages rely on proxy-only authentication. `proxy.ts:4-11` protects non-API pages, but `app/imports/page.tsx:4-14` and `app/lab/page.tsx:97+` do not call a direct server guard. | Proxy only. | A matcher/config regression removes the only direct boundary. `/imports` renders an email import surface; `/lab` links sensitive diagnostics. | Medium | Add direct server-side session enforcement to sensitive touched pages; preserve proxy as defense in depth. | Making the pages dynamic adds a small server auth call. | Anonymous access redirects to login even when page is invoked independently; authenticated behavior is unchanged. |

## Findings not reproduced

None of the ten Phase 1 findings was disproved. P1-07 needs a narrower
interpretation: append-only is appropriate for reconciliation/review event
tables, but not for `plaid_sync_runs`, whose existing workflow requires status
updates. No SQL change is authorized in this phase.

## CSP and external-source evidence

`next.config.ts:1-7` currently defines no headers. Repository fetch/frame usage
requires an allowlist for:

- Supabase project HTTPS and WSS origins for Auth/Data API/Realtime.
- Plaid Link frames/scripts and Plaid API connectivity used by the Plaid SDK.
- Google Accounts and Google OAuth/Gmail endpoints used by the server OAuth
  flow (server-to-server endpoints do not themselves require browser CSP).

Next 16's local CSP guide states nonce CSP requires dynamic rendering. This
phase will not force the entire product into dynamic rendering. A conservative
static baseline will therefore document any required inline-style/script
compatibility and avoid unsafe wildcard sources. Plaid login and Google OAuth
must be manually smoke-tested before deployment.

## Phase boundary

- No RLS policy, grant, table, trigger, migration history, token, provider, or
  production record is changed.
- `security/proposals/20260723_append_only_audit_boundaries.sql` remains a
  review artifact only.
- Leaked Password Protection remains a manual Supabase Dashboard action.
