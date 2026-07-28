# Security Preview Results

Date: 2026-07-25
Status: protected Preview deployed; automated HTTP checks passed; interactive validation incomplete

## Preview under test

- Branch: `security/phase-1-hardening`
- Stable exact origin:
  `https://mansor-one-git-security-phase-1-hardening-mansor-one.vercel.app`
- Deployment:
  `https://mansor-hfojrg7gy-mansor-one.vercel.app`
- Deployment state/target: `READY` / `preview`
- Vercel protection: SSO for generated deployments, plus Git-fork protection.
- Build configuration: Node.js `22.x`; deployed functions use `nodejs22.x`.

The branch-specific Preview variables `MANSOR_ALLOWED_ORIGINS` and
`MANSOR_INTERNAL_ADMIN_EMAILS` are stored as Vercel Sensitive values. The
origin allowlist contains only the stable origin above. No private value was
printed, recorded, or committed.

## Passed checks

| Check | Result |
| --- | --- |
| Direct anonymous access | `302` to Vercel SSO |
| `/login` behind the protection bypass | `200` |
| Anonymous `/imports` | `307` to `/login?next=%2Fimports` |
| Anonymous `/lab/review-queue` | `307` to its encoded login return path |
| Anonymous Google OAuth start | `401` |
| Anonymous Plaid connections API | `401` |
| External Origin on Plaid mutation | `403` |
| Missing Origin on Plaid mutation | `403` |
| `Sec-Fetch-Site: cross-site` | `403` |
| Exact allowed Origin without app session | `401`, proving Origin passed and authentication still failed closed |
| Generated Preview URL as unlisted Origin | `403`; `VERCEL_URL` was not implicitly trusted |
| External Origin on Gmail import | `403` |
| Exact allowed Origin on Gmail import without app session | `401` |

The Preview response includes the hardened production CSP with no
`'unsafe-eval'`, HSTS, `nosniff`, strict referrer policy, restrictive
permissions policy, `frame-ancestors 'none'`, and `X-Frame-Options: DENY`.
Supabase and Plaid sources remain explicit; no wildcard source was introduced.

## Not completed

The CLI protection bypass is not a Mansor One/Supabase user session. Therefore
the following require an interactive protected browser session and were not
represented as passed:

- login success, logout, session revocation, household/member/owner boundaries;
- Google OAuth consent/callback/state consumption;
- Gmail import and owner/member rejection;
- authenticated same-origin financial mutations;
- browser-console CSP checks for Supabase Auth, Plaid Link, Google OAuth, Next
  assets, fonts, images, and WebSockets;
- browser and redacted server-log token-leak review.

The Preview environment's provider/data isolation and exact Google, Plaid, and
Supabase redirect registrations also require operator confirmation before
provider workflows run.

## Security conclusion

Deployment protection, fail-closed authentication, Origin enforcement, strict
production headers, exact-origin behavior, and Node.js 22 are verified.
Interactive identity/provider/data-flow validation remains a release blocker.
No financial records were modified during these checks.
