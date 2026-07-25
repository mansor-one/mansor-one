# Security Phase 1.5 — Production Environment Contract

Date: 2026-07-24
Status: required configuration documented; no private values committed.

## General handling

Both variables below are server-only configuration. They must be entered in
Vercel Environment Variables and must never use a `NEXT_PUBLIC_` prefix.
Preview and Production values must be managed independently.

Do not place real domains or private email addresses in committed files,
screenshots, build logs, tickets, or client-visible responses.

## `MANSOR_ALLOWED_ORIGINS`

Purpose: exact allowlist for browser requests that perform sensitive
mutations. `lib/security/request-origin.ts` compares the normalized `Origin`
header against this list.

Required format:

```text
https://<canonical-production-host>,https://<approved-alternate-host>
```

Rules:

- comma-separated absolute origins;
- `https://` is mandatory outside local development;
- origin only: scheme, hostname, and optional non-default port;
- no path, trailing path segment, query, fragment, credentials, or wildcard;
- no trailing slash is necessary; normalization produces the exact origin;
- no whitespace is preferred, although surrounding whitespace is trimmed;
- every entry must identify a Mansor One deployment controlled by the project;
- never add `https://*.vercel.app`, `*`, `null`, localhost, a Supabase URL, a
  Plaid URL, or a Google URL;
- Preview must list only the exact preview host being validated;
- Production must list the canonical production origin and only genuinely
  supported alternate first-party origins.

Template for Vercel Preview:

```text
MANSOR_ALLOWED_ORIGINS=https://<exact-preview-deployment>.vercel.app
```

Template for Vercel Production:

```text
MANSOR_ALLOWED_ORIGINS=https://<production-domain>
```

If both apex and `www` serve the application and both must perform mutations:

```text
MANSOR_ALLOWED_ORIGINS=https://<production-domain>,https://www.<production-domain>
```

The code also recognizes Vercel's exact system-provided deployment URL,
`VERCEL_PROJECT_PRODUCTION_URL`, and `NEXT_PUBLIC_APP_URL` when valid. This
does not justify a wildcard. `MANSOR_ALLOWED_ORIGINS` remains the explicit
auditable contract.

Validation:

- same-origin mutation returns its normal application result;
- foreign `Origin` returns 403;
- missing `Origin` returns 403 in Preview and Production;
- `Sec-Fetch-Site: cross-site` returns 403 even if another header is forged;
- malformed entries fail closed rather than broadening the list.

Operational note: Vercel creates a new unique hostname for each preview
deployment. Prefer a stable protected Preview alias for OAuth/integration
testing. If a unique deployment host is used, update only the Preview
environment value and redeploy that preview; do not add a Vercel wildcard.

## `MANSOR_INTERNAL_ADMIN_EMAILS`

Purpose: restrict `/dev`, `/lab`, and Gmail diagnostic surfaces to explicitly
approved authenticated administrators. Household-owner authorization remains
a separate requirement for Gmail access.

Required format:

```text
<admin-email-1>,<admin-email-2>
```

Rules:

- comma-separated complete email addresses;
- no display names, angle brackets, roles, domains, wildcards, or regular
  expressions;
- values are trimmed and compared case-insensitively;
- use the exact email returned by the authenticated Supabase user;
- include only named people who require diagnostic access;
- use a group address only if its membership and mailbox authentication are
  tightly controlled and audited;
- remove departed users immediately;
- Preview requires a non-empty list to use internal tools;
- Production internal tools remain disabled unless the separate
  `MANSOR_ENABLE_LAB_IN_PRODUCTION=true` opt-in is approved. Even then, a
  non-empty allowlist is mandatory.

Template:

```text
MANSOR_INTERNAL_ADMIN_EMAILS=<authorized-owner-email>
```

An empty or missing value now fails closed for internal tools. It must not be
replaced with a permissive default.

Validation:

- anonymous user receives 401 or a login redirect;
- authenticated email not in the list receives 403 in Preview;
- allowlisted non-owner still cannot use household Gmail operations;
- allowlisted active household owner can access the intended Preview surface;
- Production `/dev` remains unavailable;
- Production `/lab` remains unavailable unless both the explicit flag and
  non-empty list are present.

## Secret classification

Neither allowlist is a credential, but both reveal security topology and
should remain server-only. The actual private values should be stored in
Vercel, with access restricted to deployment administrators.

Changes to either value require:

1. named approver;
2. recorded Preview test;
3. confirmation that no wildcard or unrelated origin/identity was introduced;
4. redeployment of the affected environment;
5. rollback by restoring the prior exact value if legitimate mutations or
   internal access fail.
