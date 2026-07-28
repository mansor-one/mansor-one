# Proposed Code Changes — Not Implemented

> Historical proposal from the 2026-07-23 audit. The approved Phase 1 subset
> has now been implemented locally on `security/phase-1-hardening`; see
> `SECURITY_PHASE1_IMPLEMENTATION.md`. Rate limiting, RLS/audit changes, and
> broad household-query changes remain proposals.

These changes require explicit approval.

## 1. Central privileged client

- Add `lib/supabase/admin.ts`.
- Start with `import 'server-only'`.
- Validate `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Create one client with `persistSession: false`.
- Replace the five duplicated service-role construction sites.
- Do not export it from a browser-reachable barrel.

## 2. Google/Gmail boundary

- Disable legacy `/api/auth/google/start` and callback until an administrator-
  bound OAuth flow exists.
- If retained, add authenticated admin authorization, PKCE/state, one-time
  HttpOnly state cookie and strict redirect allowlist.
- Convert ATH import to POST.
- Require an allowlisted admin or explicit household-owner capability.
- Stamp household lineage from the authenticated membership lookup.
- Return counts only; keep message subjects/snippets behind an internal
  diagnostic route.

## 3. CSRF

- Add `requireSameOriginMutation(request)`.
- Validate `Origin` against configured production origins and use
  `Sec-Fetch-Site` as defense in depth.
- Apply to every cookie-authenticated POST/PATCH/PUT/DELETE and server action.
- Do not apply browser Origin rules to the bearer-authenticated cron route.

## 4. Safe redirects

Use `getSafeRedirectPath()` in category-conflict and duplicate-resolution
responses. Never pass request-controlled absolute URLs to `new URL()`.

## 5. Security headers

Add a tested `headers()` configuration:

```text
Content-Security-Policy:
  default-src 'self';
  base-uri 'self';
  object-src 'none';
  frame-ancestors 'none';
  form-action 'self';
  script-src 'self' <Next/Plaid-compatible nonce policy>;
  connect-src 'self' <Supabase HTTPS/WSS> <Plaid endpoints>;
  frame-src <Plaid Link origins>;
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-Frame-Options: DENY
```

Start CSP in Report-Only on preview, validate Plaid Link and Supabase auth, then
enforce in production.

## 6. Route defense in depth

- Add direct `requireUser()` to any proxy-only page that gains live data.
- Make internal allowlists fail closed in preview.
- Return 404 for diagnostics outside explicitly approved environments.
- Add per-user/household rate limits for Plaid, Gmail and Robototina endpoints.

## 7. Error and log policy

- Map database/RPC failures to stable public error codes.
- Redact IDs, email snippets, transaction descriptions and provider payloads
  from production logs unless essential.
- Never return raw Supabase errors from production routes.

## 8. Household query migration

Do not globally remove `.eq('user_id', user.id)`. Inventory each query and
label `user_id` as one of:

- immutable creator/source lineage;
- personal ownership;
- obsolete compatibility field.

Only household-shared features should query by RLS/household after tests prove
same-household visibility and cross-household denial.
