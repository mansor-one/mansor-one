# Security Phase 1.6 Vercel Preview Checklist

Date: 2026-07-24
Status: prepared, not deployed

## Before deployment

- [ ] Use an isolated Preview URL and non-production Supabase/Plaid/Google data.
- [ ] Set Vercel Node.js runtime to 22.x; confirm the build log reports Node 22.
- [ ] Set `MANSOR_ALLOWED_ORIGINS` to the one exact Preview origin, e.g.
  `https://specific-preview.example.vercel.app`; no path, wildcard, or trailing
  comma.
- [ ] Set `MANSOR_INTERNAL_ADMIN_EMAILS` to the exact authorized test addresses,
  comma-separated; do not place values in Git.
- [ ] Configure all variables inventoried in
  `docs/deployment/vercel-environment-variables.md`.
- [ ] Register the same exact Preview callback/redirect URLs with Google, Plaid,
  and Supabase.

## Authentication

- [ ] Login succeeds and creates the expected session.
- [ ] Logout clears the session and protected pages redirect.
- [ ] Expire/revoke a test session; pages redirect and APIs return 401.
- [ ] An authenticated unauthorized user receives 403/404 on internal tools.
- [ ] A household member sees only authorized household data.
- [ ] A household owner can perform owner-only Gmail administration.

## Google and Gmail

- [ ] OAuth start requires authentication and household-owner authorization.
- [ ] A valid callback succeeds and consumes the one-time state.
- [ ] Invalid, expired, user-mismatched, and tampered state fail.
- [ ] Reusing a completed state fails.
- [ ] Authorized Gmail import succeeds with expected records.
- [ ] Member/outsider import is rejected before service-role work.
- [ ] No OAuth code, refresh token, or raw provider response appears in UI/logs.

## Plaid

- [ ] New Link creates one Item only.
- [ ] Update Mode uses the existing Item.
- [ ] Banco Popular credential repair preserves the active connection.
- [ ] Cross-household connection ID returns 403/404.
- [ ] Archived Item cannot be repaired or modified.
- [ ] Link renders without CSP console errors.
- [ ] Successful Link followed by failed sync reports partial failure and does
  not update successful-sync time.
- [ ] Repeated sync/update imports no duplicate `plaid_transaction_id`.
- [ ] No access token, Link token, public token, or raw Plaid response leaks.

## Financial mutation Origin checks

In browser DevTools, repeat representative card, obligation, ledger, import, and
sync mutations:

- [ ] Same-origin browser request succeeds when otherwise authorized.
- [ ] Request with an external `Origin` returns 403.
- [ ] Missing `Origin` on Preview returns 403.
- [ ] `Sec-Fetch-Site: cross-site` returns 403.
- [ ] Legitimate server callbacks use their dedicated authentication mechanism
  and are not incorrectly treated as browser mutations.
- [ ] An unlisted Preview URL is rejected; `VERCEL_URL` does not auto-authorize it.

## Headers and browser console

For `/login` and one authenticated page:

- [ ] CSP exists and contains no `'unsafe-eval'`.
- [ ] HSTS is `max-age=31536000; includeSubDomains`.
- [ ] Referrer Policy is `strict-origin-when-cross-origin`.
- [ ] Permissions Policy disables camera, microphone, and geolocation.
- [ ] `X-Content-Type-Options` is `nosniff`.
- [ ] `frame-ancestors 'none'` and `X-Frame-Options: DENY` are present.
- [ ] Plaid, Supabase HTTPS/WSS, fonts, images, and Next assets are not blocked.
- [ ] No internal stack trace, secret, credential, or sensitive payload is logged.

## Exit criteria

Record screenshots/network evidence without sensitive values. Any 401/403
bypass, cross-household result, token exposure, CSP breakage, or duplicate
financial import blocks promotion. Preview authorization is temporary: remove
the specific Preview origin after testing. Production
`MANSOR_ALLOWED_ORIGINS` must contain only the official production origin.
