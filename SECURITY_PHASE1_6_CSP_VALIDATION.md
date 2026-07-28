# Security Phase 1.6 CSP Validation

Date: 2026-07-24

## Verified behavior

The CSP is generated from `NODE_ENV` in `next.config.ts`.

| Directive/heading | Development | Preview/Production |
| --- | --- | --- |
| `script-src 'unsafe-eval'` | present | absent |
| local `ws://localhost:*` and `ws://127.0.0.1:*` | present | absent |
| `upgrade-insecure-requests` | absent | present |
| HSTS | absent | present |
| Plaid frame/connect sources | present | present |
| configured Supabase HTTPS/WSS origin | present | present |
| framing protection | `frame-ancestors 'none'`, `DENY` | same |

Development exceptions are limited to:

- `'unsafe-eval'` for React development stack reconstruction/Dev Overlay.
- local WebSocket sources for Turbopack Fast Refresh in browsers that do not
  interpret `self` as covering WebSockets.

## Local evidence

`npm run dev -- -p 3101` under Node 22 and Next 16.2.11 returned HTTP 200 for
`/login`. Its rendered CSP included `'unsafe-eval'` and the two local WebSocket
patterns, and omitted both HSTS and `upgrade-insecure-requests`.

After `npm run build`, `npm start` on port 3102 returned HTTP 200. Its rendered
CSP excluded `'unsafe-eval'` and all local WebSocket patterns, included
`upgrade-insecure-requests`, and returned:

`Strict-Transport-Security: max-age=31536000; includeSubDomains`

Both modes preserved `nosniff`, strict referrer policy, permissions policy,
Plaid sources, and Supabase HTTP/WSS connectivity.

## Preview assumption and required validation

Vercel Preview builds use a production Next build, so the code selects the
hardened branch. This was proven locally at header level, not against an actual
Vercel deployment. Before promotion, execute the Preview browser checklist and
confirm the deployed response contains no `'unsafe-eval'`.

The local smoke made a real page request and showed no server/Turbopack CSP
error. A browser Dev Overlay interaction and third-party Plaid/Google/Supabase
flows require the prepared Preview validation; curl cannot prove browser-console
behavior.
