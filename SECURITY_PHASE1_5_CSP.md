# Security Phase 1.5 — Environment-Specific CSP

Date: 2026-07-24
Status: implemented locally; not deployed.

## Why the policy is environment-specific

React development builds use `eval()` to reconstruct server-side call stacks
in the browser and provide useful debugging information. Next.js 16 documents
`'unsafe-eval'` as required in development and unnecessary in production.
Turbopack also uses a local WebSocket for Fast Refresh.

Those capabilities are development tooling, not application runtime
requirements. They are enabled only when
`process.env.NODE_ENV === 'development'`.

Vercel Preview runs a production build with `NODE_ENV=production`, so it uses
the same hardened CSP as Production and never receives the development
exceptions.

## Exact differences

| Directive/control | Local development | Vercel Preview and Production | Reason |
|---|---|---|---|
| `script-src 'unsafe-eval'` | Allowed | Absent | Required by React development debugging and the Dev Overlay. React/Next production builds do not require eval. |
| `connect-src ws://localhost:*` | Allowed | Absent | Turbopack Fast Refresh WebSocket for a localhost hostname. Explicit because browser handling of `self` for WebSockets has varied. |
| `connect-src ws://127.0.0.1:*` | Allowed | Absent | Same Fast Refresh channel when development uses the loopback address. |
| `upgrade-insecure-requests` | Absent | Enforced | Local Next development serves HTTP. Preview and Production are HTTPS and retain transport upgrading. |
| HSTS | Absent | Enforced | HSTS is inappropriate for a local HTTP development server and remains enabled for deployed production-mode responses. |

No wildcard network source, remote development host, `data:` script source,
`blob:` script source, or `'wasm-unsafe-eval'` was added. None was required by
the observed Next/React/Turbopack development path.

## Shared hardened directives

Both policies retain:

- `default-src 'self'`;
- `base-uri 'self'`;
- `object-src 'none'`;
- `frame-ancestors 'none'`;
- `form-action 'self'`;
- existing inline script/style compatibility;
- exact Plaid script, frame, and connection origins;
- the configured Supabase HTTPS/WSS origins;
- same-origin images/fonts plus the previously approved `data:`/`blob:`
  image behavior;
- X-Content-Type-Options;
- Referrer-Policy;
- Permissions-Policy;
- X-Frame-Options.

## Verification contract

Local development:

1. run `npm run dev`;
2. request a page and inspect its `Content-Security-Policy` header;
3. confirm `script-src` contains `'unsafe-eval'`;
4. confirm the two loopback WebSocket sources are present;
5. confirm `upgrade-insecure-requests` and HSTS are absent;
6. load the page in a browser and confirm React Dev Overlay/Turbopack produce
   no CSP violations.

Preview and Production:

1. run a production build and server or deploy an approved Preview;
2. inspect the response CSP;
3. confirm `'unsafe-eval'` and loopback WebSocket sources are absent;
4. confirm `upgrade-insecure-requests`, HSTS, and all baseline security
   headers remain present;
5. verify Supabase authentication, Plaid Link, and application assets as
   specified in `SECURITY_PHASE1_5_PREVIEW_PLAN.md`.
