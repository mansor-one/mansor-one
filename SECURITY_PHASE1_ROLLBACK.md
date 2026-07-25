# Phase 1 Rollback Plan

No database rollback is needed: Phase 1 adds no migration and changes no
production record.

## Preferred rollback

Revert the Phase 1 commit as one application release, rebuild, and redeploy the
last known-good artifact. Do not remove RLS, weaken authentication, rotate
tokens, or modify financial data as part of rollback.

## Control-specific isolation

1. **CSP compatibility failure:** roll back only the `headers()` change in
   `next.config.ts` to the prior release while retaining OAuth, authorization,
   service-role, redirect, and Origin fixes. Record the blocked source before
   proposing a narrow CSP addition; never add a wildcard.
2. **Origin false positive:** correct the exact
   `MANSOR_ALLOWED_ORIGINS` value. Do not disable validation globally. If an
   emergency code rollback is required, revert affected route imports and the
   helper together.
3. **Google OAuth failure:** revert the OAuth start/callback change together.
   The prior endpoints are insecure, so disable them at the edge rather than
   restoring public use.
4. **Gmail import caller failure:** update the caller to POST with a legitimate
   Origin. Do not restore a GET mutation.
5. **Admin-client problem:** restore route-local construction only in a private
   emergency branch, never in a client component, and keep auth before access.

## Verification after rollback

- Run tests, TypeScript, ESLint, production build, and `git diff --check`.
- Confirm anonymous APIs still return 401/403.
- Confirm no service-role key appears in a browser bundle.
- Confirm no migration or production-data operation was performed.
