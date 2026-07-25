# Route Protection Audit

Updated: 2026-07-24 after Phase 1 local hardening. Not deployed.

## Protection model

- `proxy.ts` remains the broad page/session refresh boundary.
- Sensitive page components use direct `requireUser()` as defense in depth.
- API routes are excluded from proxy and authenticate/authorize themselves.
- Session clients remain constrained by household RLS.
- Financial/integration mutations validate an exact allowed Origin before body
  parsing.
- Privileged clients are created only after session/role or cron-secret checks.

## Previously unprotected or partial routes

| Route | Before | Phase 1 local behavior |
|---|---|---|
| `GET /api/auth/google/start` | Public, no state | Session + active household owner; creates signed, user-bound, expiring state. |
| `GET /api/auth/google/callback` | Public arbitrary code exchange | Same owner; one-time state consumed before exchange; internal redirects only. |
| `GET /api/gmail/ath-test` | Public diagnostic | Internal allowlist + household owner; redacted status only. |
| `GET /api/gmail/ath-import` | Auth-only global mailbox mutation | Removed. Import is POST, exact Origin, active owner, server-derived lineage. |
| `GET /api/gmail/ath-parse` | Preview allowlist could fail open | Non-empty internal allowlist + household owner. |
| `GET /api/gmail/test` | Returned Gmail snippets/headers | Non-empty internal allowlist + owner; only IDs and snippet-presence flags. |
| Ledger form mutations | Absolute redirect accepted | Strict same-origin relative redirect helper. |
| `/imports`, `/lab` | Proxy only | Direct page `requireUser()` plus proxy. |

`GET/POST /api/pablo/answer` remains public but always returns 410 and accesses
no data.

## Sensitive APIs with explicit authentication

- Cards: payment confirmation, profile/schedule create, profile update.
- Obligations: details, payment confirmation/correction, candidate decision.
- Plaid: accounts, connections, Link token, token exchange, import, revoke,
  Update Mode repair/completion, manual sync, accounts/import sync.
- Ledger and Review Queue mutation routes.
- Robototina question answering.
- Gmail/OAuth routes now add the household-owner boundary.

IDs remain paired with the authenticated user or re-fetched through the
caller's queue/household RLS. No sensitive route accepts a request-provided
`user_id`, `household_id`, email, mailbox, or administrator flag.

## Origin/CSRF coverage

All financial/integration POST/PATCH routes are listed in
`SECURITY_ROUTE_MATRIX.md` and covered by a static regression gate.

Documented exemptions:

- bearer-authenticated daily cron;
- OAuth callback protected by one-time state;
- read-only Robototina POST;
- retired Pablo POST.

Production/preview missing Origin is denied. Development missing Origin is
allowed only when the request is not explicitly cross-site.

## Remaining proxy-only pages

`/advisor-v2`, `/pablo-chat`, and static dev fixtures read no financial data.
They remain cleanup candidates. Live Review Queue aliases delegate to
`ReviewQueuePage`, which directly requires a user.

## Deferred items

- Audit-event append-only RLS needs separate approval and migration testing.
- Rate limiting is not implemented.
- CSP requires browser smoke tests for Plaid Link and Google OAuth.
