# Security Phase 1.5 — Vercel Preview Validation Plan

Date: 2026-07-24
Status: plan ready; no deployment performed.

## Goal and boundaries

Validate Phase 1 on an isolated, access-controlled Vercel Preview before any
merge or Production deployment. Do not point destructive tests at Production
financial data. Prefer a dedicated Preview Supabase project, Plaid Sandbox or
Development, and a Preview-only Google OAuth client/mailbox.

Record for every test:

- preview commit SHA and exact deployment URL;
- test identity and household role;
- timestamp;
- request route and expected status;
- actual result;
- browser console CSP messages with secrets removed;
- whether any test data was created and how it will be cleaned up.

## Preconditions

- [ ] The dependency patch decision in
      `SECURITY_PHASE1_5_DEPENDENCY_REVIEW.md` is approved and validated.
- [ ] Vercel Preview Deployment Protection is enabled.
- [ ] Vercel runtime is Node.js 22 or newer.
- [ ] Preview uses non-production integration credentials.
- [ ] `MANSOR_ALLOWED_ORIGINS` contains the exact Preview origin.
- [ ] `MANSOR_INTERNAL_ADMIN_EMAILS` contains only the designated Preview
      tester.
- [ ] `NEXT_PUBLIC_APP_URL` and `GOOGLE_REDIRECT_URI` point to the same stable
      Preview host.
- [ ] Google Cloud has the exact HTTPS callback
      `https://<preview-host>/api/auth/google/callback`.
- [ ] Plaid Dashboard has the exact Preview redirect URI required by OAuth
      institutions.
- [ ] Browser DevTools Preserve Log is enabled for Console and Network.
- [ ] Test identities exist for anonymous, owner, member/viewer, and a second
      household.

## 1. Login, logout, and direct page protection

- [ ] Anonymous `/`, `/imports`, `/lab`, `/history`, `/timeline`, and
      `/plaid` redirect to `/login` without rendering financial content.
- [ ] Valid credentials establish a Supabase session and reach the safe
      relative `next` destination.
- [ ] Invalid credentials do not reveal whether an unrelated account exists.
- [ ] Logout clears the session; Back/refresh cannot restore protected data.
- [ ] Expired session causes protected pages and APIs to require login.
- [ ] A foreign or absolute `next` value cannot redirect away from Mansor One.
- [ ] Supabase auth requests are not blocked by CSP.

Expected evidence: response status/redirect chain, Supabase auth network
request, and absence of CSP errors.

## 2. Authorization matrix

| Actor | Expected |
|---|---|
| Anonymous | OAuth start and sensitive APIs return 401; protected pages redirect to login. |
| Authenticated non-owner in same household | Google OAuth start and Gmail import return 403. Normal household features follow their existing authorized role behavior. |
| Authenticated active owner | May start Google OAuth and use Gmail import. |
| User from another household | Cannot invoke Gmail/Plaid/financial operations for the first household or connection IDs. |
| Authenticated but not internally allowlisted | `/lab`, `/dev`, and Gmail diagnostics return 403 in Preview. |

- [ ] Test IDs from another household against obligation, card, Review Queue,
      Gmail, and Plaid routes; expect 403/404 without row details.
- [ ] Confirm errors contain no tokens, provider payloads, SQL detail, or
      service-role information.

## 3. Google OAuth

- [ ] Owner opens `GET /api/auth/google/start`.
- [ ] Response redirects only to `https://accounts.google.com`.
- [ ] State cookie is HttpOnly, Secure, SameSite=Lax, short-lived, and scoped
      to the callback path.
- [ ] Valid consent returns to the exact Preview callback and then a fixed
      Mansor One path.
- [ ] Provider denial returns a safe internal status.
- [ ] Missing, altered, expired, replayed, and different-user state return an
      error before token exchange.
- [ ] Callback response and logs never contain code, access token, or refresh
      token.
- [ ] Top-level Google navigation and return produce no CSP violation. Google
      does not need to be added to Mansor One `frame-src` because this is a
      top-level redirect, not an embedded frame.

## 4. Gmail import

- [ ] Owner can run the POST import from the Preview UI.
- [ ] Same-household non-owner and other-household users receive 403.
- [ ] GET on the import route returns 405.
- [ ] Repeating the same Gmail import does not duplicate messages or financial
      records.
- [ ] Response exposes counts/status only, not message bodies, tokens, or
      sensitive provider errors.
- [ ] Gmail API calls occur server-side and therefore do not require browser
      CSP sources.

## 5. Plaid Link, redirects, Update Mode, and sync

Using Plaid Sandbox/Development only:

- [ ] New Link opens, closes, and completes.
- [ ] Institution OAuth handoff returns to the exact Preview origin.
- [ ] `script-src` permits the Plaid SDK from `cdn.plaid.com`.
- [ ] `frame-src` permits the Link frame.
- [ ] `connect-src` permits the configured Plaid environment.
- [ ] The browser receives a Link token but never an access token.
- [ ] Public-token exchange works only for a new connection.
- [ ] “Reparar conexión” launches Update Mode for an eligible existing
      connection without creating a second Item or exchanging a public token.
- [ ] Successful repair runs accounts/balances then transactions and updates
      success metadata only after both succeed.
- [ ] Repeated sync does not duplicate connections, imports, transactions, or
      reconciliation links.
- [ ] Another household cannot repair, revoke, or sync the connection.

## 6. Origin-protected mutations

Exercise every family listed in `SECURITY_ROUTE_MATRIX.md`:

- Cards;
- obligations and reconciliation candidates;
- Review Queue;
- ledger category/duplicate resolution;
- Plaid create, exchange, repair, import, revoke, and synchronization;
- Gmail ATH import;
- internal transaction-intelligence mutations.

For each route:

- [ ] Exact Preview Origin reaches normal session/authorization handling.
- [ ] Foreign Origin returns 403.
- [ ] Missing Origin returns 403.
- [ ] `Sec-Fetch-Site: cross-site` returns 403.
- [ ] Invalid request body with valid Origin returns a validation error, not a
      server trace.
- [ ] Authorization is still enforced after Origin passes.

The daily Plaid cron route is tested separately with its exact bearer secret;
it must not be changed to Origin authentication.

## 7. CSP and security headers

On representative pages (`/login`, Dashboard, `/plaid`, `/ath-movil`,
`/imports`, `/lab/review-queue`):

- [ ] CSP is enforced, not report-only.
- [ ] No required Next/Vercel script, chunk, stylesheet, image, or font is
      blocked.
- [ ] Supabase HTTPS and WSS requests use the configured project origin and are
      allowed.
- [ ] Plaid Link produces no blocked script, frame, style, or connection.
- [ ] Google OAuth remains a top-level navigation.
- [ ] No unexpected third-party source is added merely to silence an error.
- [ ] `frame-ancestors 'none'`/DENY prevents framing.
- [ ] HSTS is present only under HTTPS production-mode responses.
- [ ] X-Content-Type-Options, Referrer-Policy, and Permissions-Policy are
      present.

Current static CSP assessment:

| Integration | Static result | Preview proof still required |
|---|---|---|
| Supabase Auth/Data API | Configured Supabase HTTPS origin and matching WSS host are in `connect-src`. | Login, refresh, logout, and any Realtime connection. |
| Plaid Link | `cdn.plaid.com` is allowed for scripts/frames/connections; Plaid production, development, and sandbox APIs are explicit. `unsafe-inline` remains for current Next/Plaid compatibility. | New Link, institution OAuth, and Update Mode. |
| Google OAuth/Gmail | OAuth is top-level navigation; callback and Gmail calls are server-side. No Google frame/script source is needed. | Full consent/denial/callback flow. |
| Vercel/Next assets | Same-origin `_next` scripts, styles, images, and API requests are covered by `'self'`. Fonts and local/data images are allowed. | Inspect all representative pages and deployment toolbar behavior. |

If the optional Vercel Preview toolbar is blocked, do not broaden Production
CSP automatically. Prefer disabling the toolbar for this validation or add a
Preview-only, precisely documented policy after approval.

## 8. Preview-origin versus Production-origin behavior

Preview:

- [ ] Exact Preview host succeeds.
- [ ] A different Vercel preview hostname fails with 403.
- [ ] Production hostname sent as Origin fails unless explicitly present in
      the Preview value.

Production configuration review without deployment:

- [ ] Exact canonical Production host is documented.
- [ ] Preview host is absent from Production configuration.
- [ ] No Vercel wildcard is present.
- [ ] Apex/`www` behavior matches the intended canonical redirect policy.

After separate Production approval, repeat a non-destructive smoke subset on
Production before enabling imports or sync.

## Exit criteria

- no unexplained CSP violation;
- all authorization negative cases pass;
- all mutation Origin negative cases pass;
- OAuth/Gmail/Plaid secrets remain server-only;
- Plaid and Gmail operations remain idempotent;
- no Production data or credentials were used;
- every failure has owner, severity, and disposition;
- tests, TypeScript, ESLint, build, `git diff --check`, and `npm audit` results
  are attached to the preview record.
