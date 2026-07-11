# Vercel Deployment Readiness Audit

Last updated: 2026-07-11

Scope: audit only. No deployment, no secret changes, no production writes.

## Summary

Mansor One is close to Vercel Preview readiness, but not Production ready.

- Preview readiness score: 72/100
- Production readiness score: 48/100

The application is a standard Next.js 16 App Router project with Node-compatible
server routes and a Next `proxy.ts` auth boundary. No local filesystem
persistence assumptions were found in app/lib runtime code. The main deployment
risks are environment configuration, OAuth callback registration, exposed dev
surfaces, and a few routes that are too permissive for Production.

## Files Reviewed

- `package.json`
- `next.config.ts`
- `proxy.ts`
- `lib/supabase/config.ts`
- `lib/supabase/server.ts`
- `lib/supabase/proxy.ts`
- `lib/supabase.ts`
- `lib/plaid/client.ts`
- `lib/security/encryption.ts`
- `app/api/auth/google/*`
- `app/api/plaid/*`
- `app/api/gmail/*`
- `app/api/ledger/*`
- `app/api/review-queue/*`
- `app/api/cards/*`
- `app/api/robototina/answer/route.ts`
- `app/dev/*`
- `app/lab/*`
- `README.md`
- `docs/README.md`

## Platform Fit

Good:

- `package.json` has normal Vercel-compatible scripts: `build`, `start`, `dev`.
- No custom server.
- No `output: 'export'`; server routes and Proxy are compatible with a Node
  deployment target.
- `proxy.ts` uses the current Next Proxy convention rather than deprecated
  `middleware.ts`.
- No app/lib runtime use of `fs`, `/tmp`, or durable local files was found.
- No explicit Edge runtime was found; Plaid, crypto, and Supabase admin code can
  stay on Node.js runtime.

Needs decision:

- No `vercel.json` exists. That is acceptable for Preview, but Production should
  define route protections, cron decisions, and possibly function max durations
  if sync routes grow.
- No Vercel Cron jobs are configured. Current sync/import flows appear user
  initiated. Cron is not required for Preview.

## Preview Blockers

1. Environment variables must be configured in Vercel Preview before deploy.
   Missing values will break Supabase auth, Plaid, Gmail, and token encryption.

2. Supabase Auth redirect URLs must allow Vercel Preview URLs.
   Supabase recommends setting the production site URL and adding local plus
   Vercel preview wildcard redirects such as:
   - `http://localhost:3000/**`
   - `https://*-<team-or-account-slug>.vercel.app/**`

3. Google OAuth preview is not generally practical with arbitrary Vercel preview
   URLs because Google redirect URIs must exactly match registered URIs and
   cannot use wildcards. Use a stable Preview URL or skip Google OAuth testing in
   ephemeral previews.

4. `/api/gmail/test` and `/api/gmail/ath-parse` are unauthenticated and can read
   Gmail through `GOOGLE_REFRESH_TOKEN` if production env vars are present.
   These should be disabled, authenticated, or moved behind dev-only protection
   before any shared Preview.

5. `app/api/auth/google/callback/route.ts` logs the full token payload. Do not
   use this route with real credentials in Preview or Production until token
   logging is removed.

## Production Blockers

1. Disable or protect all `/dev/*` routes.
   Current dev routes expose operational diagnostics and admin workflows. Auth
   proxy protects pages, but Production should explicitly deny or feature-gate
   `/dev`.

2. Disable or protect `/api/dev/*`.
   These routes are authenticated, but they mutate or generate suggestions and
   should not be production-public unless intentionally promoted.

3. Fix Gmail routes before Production:
   - Remove token logging from Google OAuth callback.
   - Authenticate or remove `/api/gmail/test`.
   - Authenticate or remove `/api/gmail/ath-parse`.
   - Decide whether Gmail import is an admin-only manual route or a scheduled
     job.

4. Register final Production URLs in external providers:
   - Supabase Site URL and redirects.
   - Google OAuth authorized redirect URI.
   - Plaid allowed redirect URI if OAuth institutions are used.
   - Plaid webhook URL if webhooks are enabled.

5. Split Preview and Production secrets.
   Production must not reuse local/Preview refresh tokens, Plaid sandbox
   credentials, or encryption keys by accident.

6. Add a Production route policy for `/lab/*`.
   `/lab/review-queue` appears closer to operational tooling than public app UI.
   Decide whether it remains available to authenticated users in Production.

## Warnings

- `SUPABASE_SERVICE_ROLE_KEY` is used in several route modules. This is
  server-only and acceptable only if never imported by Client Components.
  Current usage appears server-route only.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_URL` are expected
  public browser variables.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is supported as a public replacement
  key fallback, but local code still supports anon key.
- `NEXT_PUBLIC_PLAID_ENV` exists in `.env.local` but no current code reference
  was found. Treat as development-only or remove later.
- `MANSOR_USER_ID` exists in `.env.local` but no current code reference was
  found. Treat as development-only legacy.
- Plaid sync/import routes can be long-running if many transactions or
  connections exist. They are probably fine for Preview, but should be monitored
  against Vercel function duration limits before Production.
- `app/api/plaid/create-link-token/route.ts` does not pass `redirect_uri` or
  `webhook`. That is fine for non-OAuth flows, but Production OAuth institutions
  and webhook-driven updates need explicit configuration.

## Route Treatment

Recommended Production policy:

- Public unauthenticated: `/login`, static assets only.
- Authenticated app: main dashboard, Robototina, spending, history, portfolio,
  timeline, income, planning, cards.
- Authenticated but admin-only or disabled: `/dev/*`, `/lab/*`,
  `/api/dev/*`, duplicate/category admin workflows.
- Retired compatibility: `/advisor` redirects to `/robototina`,
  `/pablo-chat` redirects to `/robototina`,
  `/api/pablo/answer` returns `410 Gone`.

## External Docs Referenced

- Vercel environment variables:
  https://vercel.com/docs/environment-variables
- Vercel function runtimes:
  https://vercel.com/docs/functions/runtimes
- Supabase redirect URLs:
  https://supabase.com/docs/guides/auth/redirect-urls
- Google OAuth web server redirect rules:
  https://developers.google.com/identity/protocols/oauth2/web-server
- Plaid OAuth redirect guidance:
  https://plaid.com/docs/link/oauth/
- Plaid webhook update API:
  https://plaid.com/docs/api/items/#itemwebhookupdate

## Recommendation

Proceed to a private Vercel Preview only after configuring Preview env vars and
either disabling Gmail test routes or ensuring Preview is access-controlled. Do
not proceed to Production until dev surfaces, Google token logging, Gmail test
routes, OAuth callback URLs, and Plaid Production settings are resolved.

## Validation Results

- `npm run build`: passed with network access. The first sandboxed attempt failed
  because Next.js could not fetch Google-hosted `next/font` assets.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
