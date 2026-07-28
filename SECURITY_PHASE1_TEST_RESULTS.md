# Mansor One Security Phase 1 — Test Results

Date: 2026-07-24
Branch: `security/phase-1-hardening`
Production data/migrations: not touched.

## Automated validation

| Check | Result |
|---|---|
| `npm test` | Passed: 25 files, 25 passed, 0 failed. |
| Security-specific suite | Passed as part of `npm test`: OAuth state, Gmail owner policy, Origin policy/coverage, redirects, diagnostics, service-role centralization, headers, direct page guards. |
| `npx tsc --noEmit` | Passed. |
| `npm run lint` | Passed with 0 errors and 6 pre-existing unused-code warnings in `app/lab/review-queue/ReviewQueueClient.tsx`. |
| `npm run build` | Passed on Next.js 16.2.10; 52 static pages generated and dynamic routes compiled. |
| `git diff --check` | Passed. |
| Local production-header smoke | `/login` returned enforced CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, and DENY framing headers. |

The final sandboxed build attempt temporarily failed while downloading Geist
from Google Fonts. Per the validation policy it was retried with network access
and passed. This was an external fetch failure, not a compilation/type failure.

## Mechanical pre-existing test correction

`tests/semi-monthly-spending.test.ts` previously failed because
`lib/financial-engine/semi-monthly-spending.ts` used extensionless internal
imports under Node's TypeScript stripping runner. Only `.ts` extensions were
added to three imports. Production behavior and financial calculations are
unchanged. The test now passes.

## Dependency audit

First `npm audit --audit-level=low` attempt failed with registry DNS
`EAI_AGAIN`. The one required retry completed and **did not pass**:

- 12 high-severity findings.
- Direct/runtime chain: the installed Next 16.2.10, its PostCSS dependency, and
  Sharp are in reported affected ranges.
- Development/tooling chain: `brace-expansion` through Minimatch/ESLint
  packages.
- npm reports a non-breaking `npm audit fix` path for Next/PostCSS/Sharp and a
  breaking `--force` path involving ESLint 10 for the remaining tooling chain.

No dependency was changed automatically. This is a production release blocker
that needs a separately reviewed dependency update and full regression run.
The project must not be described as dependency-audit clean.

## Manual validation still required

- Real anonymous/member/owner OAuth and Gmail flows.
- Replay/different-user OAuth callback in a deployed HTTPS cookie environment.
- Plaid Link, login/session refresh, Supabase HTTP/WSS, and Google OAuth under
  enforced CSP.
- Legitimate browser mutations under each exact production origin.
- Cross-user and cross-household tests from
  `MANUAL_SECURITY_TEST_PLAN.md`.
- Manuel's confirmation of Supabase Leaked Password Protection.

## Dependencies added

None.
