# Vercel Production Checklist

Last updated: 2026-07-11

## Before Preview

- [ ] Configure Preview environment variables in Vercel.
- [ ] Confirm Supabase redirect URLs include Vercel preview wildcard.
- [ ] Decide whether Google OAuth is disabled in ephemeral Preview or uses a
  stable Preview URL.
- [ ] Disable, protect, or accept risk for unauthenticated Gmail test routes.
- [ ] Run `npm run build`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `git diff --check`.
- [ ] Deploy Preview only after the above pass.

## Before Production

- [ ] Remove Google OAuth token logging from
  `app/api/auth/google/callback/route.ts`.
- [ ] Authenticate or remove `app/api/gmail/test/route.ts`.
- [ ] Authenticate or remove `app/api/gmail/ath-parse/route.ts`.
- [ ] Decide Production access policy for `/dev/*`.
- [ ] Decide Production access policy for `/lab/*`.
- [ ] Decide Production access policy for `/api/dev/*`.
- [ ] Configure Production Supabase Site URL.
- [ ] Configure Production Supabase redirect URLs.
- [ ] Configure Google OAuth Production authorized redirect URI.
- [ ] Configure Plaid Production credentials.
- [ ] Register Plaid allowed redirect URI if OAuth institutions are used.
- [ ] Register Plaid webhook URL if webhook updates are required.
- [ ] Confirm `PLAID_TOKEN_ENCRYPTION_KEY` is stable and backed up securely.
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is only configured as server-only.
- [ ] Confirm no server-only secrets use `NEXT_PUBLIC_`.
- [ ] Confirm RLS policies are production-ready for exposed tables.
- [ ] Confirm no migration SQL needs to be run as part of deployment.
- [ ] Decide if Plaid/Gmail syncs need Vercel Cron jobs.
- [ ] Confirm observability/logging does not print tokens, access tokens,
  refresh tokens, service role keys, or Plaid secrets.

## Smoke Test After Preview Deploy

- [ ] `/login` loads.
- [ ] Authenticated `/` loads.
- [ ] Authenticated `/robototina` loads.
- [ ] `/advisor` reaches Robototina through compatibility redirect.
- [ ] `/pablo-chat` reaches Robototina through compatibility redirect.
- [ ] `/api/pablo/answer` returns `410 Gone`.
- [ ] `/api/robototina/answer` returns `401` when unauthenticated and a normal
  Q&A response when authenticated.
- [ ] Supabase session refresh works after reload.
- [ ] Plaid create-link-token works in Preview environment.
- [ ] Plaid exchange-public-token stores encrypted token.
- [ ] Gmail import route is unavailable unless intentionally enabled.

## Production Go / No-Go

Go only when:

- Build and typecheck pass.
- Production env vars are complete.
- OAuth callbacks are registered.
- Dev/test routes are gated.
- Token logging is removed.
- Rollback plan is ready.

No-go if:

- Any unauthenticated route can read Gmail or financial data.
- Any route logs provider tokens.
- Production uses Preview/local credentials.
- Plaid token encryption key is missing or unknown.
- Supabase redirect URLs are not configured for production domain.
