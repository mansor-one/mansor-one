# Preview Deployment Record

Date: 2026-07-25
Branch: `security/phase-1-hardening`
Production deployment: prohibited and not performed

## Deployment

- Stable exact origin:
  `https://mansor-one-git-security-phase-1-hardening-mansor-one.vercel.app`
- Validation deployment:
  `https://mansor-hfojrg7gy-mansor-one.vercel.app`
- Deployment ID: `dpl_981Es1DHWUzS9MX9YxQvCrKgNgZK`
- State/target: `READY` / `preview`
- Protection: Vercel SSO on generated deployments and Git-fork protection.
- Project build runtime: Node.js `22.x`.
- Function runtime: `nodejs22.x`.

The exact stable origin and private administrator allowlist were configured as
branch-scoped, Preview-only Vercel Sensitive variables. No wildcard,
automatically trusted `VERCEL_URL`, committed value, or private value in this
record was used.

## Completed order

1. Apply and read back the already approved additive Plaid timestamp migration.
2. Persist Phase 1.6 only to `security/phase-1-hardening`.
3. Authenticate Vercel CLI and link the existing `mansor-one` project.
4. Confirm deployment protection.
5. Set project Node.js to 22.x.
6. Configure the two branch-specific Preview Sensitive variables.
7. Redeploy the existing branch deployment with `--target preview`.
8. Confirm `READY`, Preview target, stable alias, and Node.js 22 functions.
9. Execute non-mutating anonymous, Origin, authentication-boundary, and header
   checks.

No Production deployment or additional database migration was run.

## Repository state

The validation deployment's source commit is
`68fcf58f3396429153366907362b3839ab127b19`. `origin/main` remains at
`990aed27f63a50f40d8d73db4585bc5c48a42363`.

The reports were subsequently committed as `928f099` and produced a separate
`READY` Preview with the same stable branch alias and Node.js 22 runtime. That
documentation-only deployment is not represented as a second execution of the
interactive checklist.

The unrelated unstaged edit in
`lib/financial-engine/semi-monthly-spending.ts` remains outside all Phase 1.6
commits and was not included in the Vercel deployment.

## Rollback

If interactive validation fails, restore the previous Preview application
deployment or stop using this branch Preview. Do not promote it. The nullable
Plaid columns need not be dropped for an application rollback; database rollback
requires separate approval and the documented rollback SQL.

## Remaining operator validation

An authenticated browser session is still required for OAuth, Gmail, Plaid
Link/Update Mode, household authorization, browser-console CSP, timestamp, and
transaction-idempotency evidence. Confirm the provider redirects and Preview
data target before those workflows are exercised.
