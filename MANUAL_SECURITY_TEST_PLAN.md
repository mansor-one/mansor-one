# Manual Security Test Plan

Run against a disposable Supabase branch or local database. Never use real
Plaid/Gmail credentials or production financial records.

## Identities

- Anonymous browser.
- User A: owner of Household 1.
- User B: member of Household 1.
- User C: owner of Household 2.
- User V: viewer of Household 1.
- Internal admin and ordinary authenticated user.

## Anonymous

1. Request every product page; expect redirect to `/login`.
2. Request every sensitive API; expect 401/403/404.
3. Query all public tables with anon key; expect no financial rows.
4. Attempt SELECT/INSERT/UPDATE/DELETE on each zero-policy table; expect denial.
5. Confirm `/api/auth/google/start` and callback are unavailable after the
   approved code change.
6. Confirm retired Pablo API returns only 410 and no data.

## Authenticated same household

1. User A creates a disposable account/transaction.
2. User B can read it where the feature is household-shared.
3. User B can perform allowed mutations if role is `member`.
4. User V can read but cannot insert/update/delete.
5. Confirm every inserted row receives Household 1 and lineage cannot be
   reassigned.
6. Confirm application pages do not hide household-shared rows merely because
   they were created by User A.

## Cross-user personal data

1. Create a personal `pablo_questions` fixture only on a disposable branch if
   the feature is revived.
2. User B must not read/update/delete User A's personal row.
3. Ensure user-scoped policies include both UPDATE `USING` and `WITH CHECK`.

## Cross-household

For every active financial table:

1. User C cannot select Household 1 rows by listing or direct ID.
2. User C cannot insert a row with Household 1 ID.
3. User C cannot update/delete Household 1 rows.
4. User C cannot link a child row to an account/card/person in Household 1.
5. Foreign-key or RPC paths do not bypass the household predicate.

## Zero-policy/legacy tables

1. Anonymous and authenticated roles cannot perform any operation.
2. Verify Advisor shows an intentional deny policy after proposal approval.
3. Confirm active pages and APIs still work, proving no hidden dependency.
4. Confirm `plaid_items.access_token` remains empty.

## API authorization and IDOR

1. Replay User A's account, card, Plaid connection, obligation, payment-link and
   transaction IDs as User C; expect 404/403 and no mutation.
2. Send request-provided `user_id`/`household_id`; confirm they are ignored or
   rejected.
3. Retry a Plaid sync using another user's run ID; expect no new run based on
   that record.
4. Attempt Gmail import as ordinary user; expect 403.
5. Attempt internal dev/lab endpoints without allowlist membership; expect
   403/404 in preview/production.

## CSRF and redirects

1. Send each mutation with a foreign Origin; expect 403.
2. Send mutation methods without Origin according to the documented
   non-browser policy; expect explicit handling.
3. GET must never import Gmail, reconcile, sync, confirm or delete.
4. Supply `redirectTo=https://attacker.example`; response must remain on the
   Mansor One origin.

## Plaid/Gmail secrets

1. Inspect production browser bundles; no service-role, Plaid secret, Google
   secret/refresh token or encryption key appears.
2. Verify API responses/logs never include access tokens, IVs or auth tags.
3. Use an invalid ciphertext; expect a generic error, not token material.
4. Verify token revocation is scoped to the authenticated household/user and
   requires explicit confirmation.

## Headers

Verify on HTML and API responses:

- CSP present and compatible with Plaid Link.
- HSTS present over production HTTPS.
- `nosniff`, Referrer-Policy, Permissions-Policy.
- `frame-ancestors 'none'` and/or `X-Frame-Options: DENY`.

## Regression gate

1. Run authorization SQL in a transaction and roll back.
2. Run Security Advisor; no unexpected permissive/no-policy findings.
3. Run tests, TypeScript, ESLint and production build.
4. Run dependency audit with registry access.
5. Confirm no production data, balances or history changed.
