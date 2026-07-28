# Production Go/No-Go

Date: 2026-07-25
Decision: **NO-GO**

## Passed

- Protected Vercel Preview is deployed and `READY`.
- Preview uses project/runtime Node.js 22.x.
- Exact branch Preview Origin and internal admin allowlist are stored as
  branch-scoped Sensitive values.
- Vercel SSO and Git-fork protection are enabled.
- Anonymous route/API authentication boundaries passed.
- External, missing, cross-site, and unlisted generated Preview Origins are
  rejected.
- The one exact allowed Origin does not bypass application authentication.
- Production CSP contains no `'unsafe-eval'`; hardened security headers are
  present.
- No additional migration, Production deployment, RLS change, or financial-data
  mutation occurred.

## Exact blockers

1. No authenticated Mansor One browser validation has covered login, logout,
   revoked sessions, owner/member/outsider behavior, or household boundaries.
2. Google OAuth callback/state handling and Gmail import have not been exercised
   end to end in Preview.
3. Plaid new Link, Banco Popular Update Mode, stale-error recovery,
   `REPAIR_SYNC_PENDING`, and archived/cross-household behavior have not been
   exercised end to end in Preview.
4. Real timestamp transitions and before/after transaction idempotency have not
   been captured.
5. Browser-console CSP behavior and browser/network token-leak review remain
   unverified.
6. The operator must confirm Preview data/provider isolation and exact Google,
   Plaid, and Supabase redirect registrations before executing provider flows.

The automated HTTP evidence materially advances Preview readiness, but it
cannot substitute for authenticated and provider-interactive validation.
Do not merge to `main` or deploy to Production until every blocker is closed
with redacted evidence.
