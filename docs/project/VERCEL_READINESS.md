# Vercel Readiness

Last updated: 2026-07-16

## Current scores

- Preview Readiness: 86/100
- Production Readiness: 68/100

## Evidence

- `npm run build`: passed with network access for Google-hosted Next fonts.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed after Phase 0.
- `node scripts/check-vercel-security-gate.mjs`: passed.
- `node scripts/check-legacy-advisor-usage.mjs`: passed after scoping the guard
  to active code roots.
- No `vercel.json` found.
- No cron configuration found.
- `proxy.ts` delegates to `lib/supabase/proxy.ts`, which protects authenticated
  app routes and internal tool surfaces.
- `/dev` and `/lab` are blocked in production by default through
  `evaluateInternalToolAccess`.

## Preview blockers

1. Configure Vercel Preview env vars.
2. Decide stable Preview URL for Google/Plaid callback testing.
3. Run authenticated smoke tests.
4. Ensure accidental root files are not committed.

## Production blockers

1. Production provider callbacks must be registered.
2. Gmail import mode must be decided.
3. Plaid webhook/retry/observability must be production-ready.
4. Service-role route ownership must be reviewed.
5. Legacy direct-data routes must be hidden, migrated, or explicitly blocked.
6. Backups/rollback/migration policy must be rehearsed.

## Environment inventory

Public:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server-only:

- `SUPABASE_SERVICE_ROLE_KEY`
- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV`
- `PLAID_TOKEN_ENCRYPTION_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_REFRESH_TOKEN`
- `MANSOR_INTERNAL_ADMIN_EMAILS`
- `MANSOR_ENABLE_LAB_IN_PRODUCTION`

Development/legacy candidates:

- `NEXT_PUBLIC_PLAID_ENV`
- `MANSOR_USER_ID`

## Route treatment

- Household app routes: authenticated.
- `/dev/*`, `/api/dev/*`: internal only, production blocked.
- `/lab/*`: internal only, production blocked unless explicitly allowlisted.
- Gmail diagnostic routes: internal only.
- `/api/pablo/answer`: retired `410 Gone`.
- `/advisor`, `/pablo-chat`: compatibility routes only.

## Recommended Preview sequence

1. Finish Phase 0 checkpoint.
2. Configure Preview env vars with no secret printing.
3. Register Supabase Preview redirect.
4. Use stable Preview domain if testing Google/Plaid callbacks.
5. Deploy private Preview.
6. Run smoke tests for login, dashboard, Robototina, Spending, History,
   Portfolio, Timeline, Cards, Planning, Plaid read-only state.
7. Confirm internal routes are blocked/allowed exactly as expected.
