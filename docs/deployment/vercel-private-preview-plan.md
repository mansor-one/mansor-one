# Vercel Private Preview Setup Plan

Last updated: 2026-07-11

Scope: documentation and planning only. Do not deploy automatically, do not
print secret values, do not commit `.env` files, and do not change Production
provider settings.

## Recommended Preview URL Strategy

Use a stable Preview branch/domain for the first private Preview.

Recommended path:

1. Create a dedicated Vercel Preview branch such as `preview`.
2. Assign a stable Vercel branch URL or custom staging domain to that branch.
3. Keep random pull-request Preview URLs for UI-only checks, but do not use them
   for Google OAuth.

Why:

- Supabase can safely allow Vercel Preview wildcard redirects.
- Google OAuth cannot safely use random Preview URLs because authorized redirect
  URIs must match exactly and do not support wildcards.
- Plaid can be deferred for the first smoke test. If Plaid OAuth/webhooks are
  needed later, a stable preview URL is easier to register and audit.

## First Deploy Scope

Phase A should validate the read-heavy, authenticated app without enabling risky
provider workflows.

Enable for Phase A:

- Supabase Auth
- Dashboard
- Spending
- History
- Planning
- Portfolio
- Timeline
- Robototina rules-based context and Q&A

Keep out of Phase A smoke testing:

- Gmail OAuth/import
- Plaid reconnect/revoke
- Plaid new account connection
- Write-heavy dev/admin tools
- Scheduled jobs and webhooks

The routes may still exist, but the first Preview validation should not exercise
the risky provider flows until provider-specific Preview settings are reviewed.

## Preview Variable Checklist

| Variable | Required for Phase A | Visibility | Preview value source | First smoke test treatment |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Required | Public | Prefer dedicated Preview/Staging Supabase project; otherwise same project only for private smoke test | Present |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required unless publishable key fully replaces it | Public | Match Preview Supabase project | Present |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Optional but preferred | Public | Match Preview Supabase project | Present if available |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for current server/admin routes to build and run | Server-only secret | Prefer Preview/Staging Supabase service key; otherwise same project only for private smoke test | Present, never exposed |
| `PLAID_CLIENT_ID` | Optional for Phase A | Server-only secret | Plaid sandbox/development only | May remain absent if Plaid routes are not tested |
| `PLAID_SECRET` | Optional for Phase A | Server-only secret | Plaid sandbox/development only | May remain absent if Plaid routes are not tested |
| `PLAID_ENV` | Optional for Phase A | Server-only config | `sandbox` or `development`, not Production | May remain absent if Plaid routes are not tested |
| `PLAID_TOKEN_ENCRYPTION_KEY` | Required if any Plaid token exchange/import route is tested | Server-only secret | Preview-specific stable key for Preview database | Keep absent for first smoke test if Plaid connection/exchange is not tested |
| `GOOGLE_CLIENT_ID` | Optional for Phase A | Server-only config | Preview/staging OAuth client only | Keep absent for first smoke test unless using stable Preview OAuth |
| `GOOGLE_CLIENT_SECRET` | Optional for Phase A | Server-only secret | Preview/staging OAuth client only | Keep absent for first smoke test |
| `GOOGLE_REDIRECT_URI` | Optional for Phase A | Server-only config | Stable Preview callback URL only | Keep absent for first smoke test |
| `GOOGLE_REFRESH_TOKEN` | Optional for Phase A | Server-only secret | Preview-only mailbox/token if Gmail is enabled later | Keep absent for first smoke test |
| `MANSOR_INTERNAL_ADMIN_EMAILS` | Recommended | Server-only config | Allowlisted authenticated emails only | Present for private Preview |
| `MANSOR_ENABLE_LAB_IN_PRODUCTION` | Not for Preview | Server-only config | Production-only optional override | Absent |
| `NEXT_PUBLIC_PLAID_ENV` | Not required | Public | Stale/development-only | Absent |
| `MANSOR_USER_ID` | Not required | Server-only legacy | Stale/development-only | Absent |
| `NODE_ENV` | Platform-provided | Platform config | Vercel-managed | Do not set manually |
| `VERCEL_ENV` | Platform-provided | Platform config | Vercel-managed | Do not set manually |

Safest data posture:

- Best: use a separate Supabase Preview/Staging project with scrubbed or
  intentionally selected data.
- Acceptable for first private smoke test only: point Preview at the current
  Supabase project, keep the deployment private, allowlist internal users, and
  avoid write-heavy routes.
- Do not use Production Plaid or Gmail credentials in Preview.

## Provider Callback Matrix

| Provider | Random Vercel Preview URL | Stable Preview branch/domain | Production setting changes needed now? | Notes |
| --- | --- | --- | --- | --- |
| Supabase Auth | Works if preview wildcard is added | Works if exact stable URL is added | No Production changes; add Preview redirect entries only | Keep Production Site URL pointed at Production. Add Preview redirect URLs separately. |
| Google OAuth | Not suitable | Required if OAuth is tested | No | Google redirect URIs must exactly match. Use a separate Preview OAuth client or defer Gmail/OAuth. |
| Plaid Link OAuth | Not recommended for first pass | Recommended if OAuth institutions are tested | No | Current link-token route does not set `redirect_uri`; defer OAuth institutions until route/provider strategy is explicit. |
| Plaid Webhooks | Not useful | Required for stable delivery | No | No cron/webhook validation in Phase A. Register only after webhook behavior is intentionally enabled. |
| Gmail Import | Not recommended | Only with stable Google OAuth callback | No | Diagnostic routes are internally gated; `GOOGLE_REFRESH_TOKEN` should remain absent in first smoke test. |

## Supabase Configuration

Preview changes:

- Add `http://localhost:3000/**` if not already present.
- Add Vercel Preview wildcard, for example
  `https://*-<team-or-account-slug>.vercel.app/**`.
- Add the stable Preview branch/domain explicitly if used.

Production should remain unchanged:

- Keep Production Site URL pointed at the final Production domain.
- Do not change Production OAuth/provider callbacks during the Preview setup.

## Smoke Test Checklist

Authentication:

- Unauthenticated `/` redirects to `/login`.
- `/login` loads.
- Login succeeds with an allowlisted Preview user.
- Logout clears the session.
- Authenticated reload keeps the session.
- `/advisor` redirects to `/robototina`.
- `/pablo-chat` redirects to `/robototina`.

Core app:

- Dashboard loads without server errors.
- Spending loads and totals match the current expected ledger state.
- History loads and duplicate-resolved audit visibility still works.
- Portfolio balances render.
- Timeline projection renders.
- Planning renders.
- Robototina loads recommendations from `getRobototinaContext()`.
- `/api/robototina/answer` returns `401` unauthenticated and a normal Q&A
  response when authenticated.

Internal/security gates:

- Unauthenticated `/dev/financial-engine` redirects to `/login`.
- Unauthenticated `/lab/review-queue` redirects to `/login`.
- Unauthenticated `/api/dev/transaction-intelligence/generate-plaid-suggestions`
  returns `401`.
- Unauthenticated `/api/gmail/test` returns `401`.
- Unauthenticated `/api/gmail/ath-parse` returns `401`.
- Authenticated non-allowlisted users cannot access internal routes when
  `MANSOR_INTERNAL_ADMIN_EMAILS` is configured.
- Vercel logs contain no secret values, Google token payloads, Plaid access
  tokens, service role keys, or Gmail email bodies.

Provider flows to skip in Phase A:

- Do not run Google OAuth start/callback.
- Do not run Gmail import.
- Do not connect/reconnect Plaid.
- Do not revoke Plaid connections.
- Do not test Plaid webhooks.

## Rollback Plan

If Preview fails before traffic is shared:

1. Disable or delete the Vercel Preview deployment.
2. Remove Preview environment variables from Vercel if they were incorrect.
3. Remove any Preview-only Supabase redirect URLs that are no longer needed.
4. Do not rotate Production secrets unless a secret was exposed.
5. Review Vercel function logs for stack traces, but do not paste secret-bearing
   logs into tickets or commits.
6. Re-run local validation before attempting another Preview.

If Preview accidentally points at the wrong provider environment:

1. Stop using the deployment immediately.
2. Remove the incorrect Preview env vars.
3. Check provider dashboards for unintended new sessions, OAuth grants, or Plaid
   Items.
4. Revoke only the affected Preview credentials/tokens.
5. Keep quick-entry and financial repair work separate from deployment rollback.

## Remaining Production Blockers

- Final Production Supabase Site URL and redirects.
- Google OAuth Production callback, if Gmail remains enabled.
- Plaid Production credentials, redirect URI, and webhook strategy.
- Decision on whether Gmail import is manual admin-only or scheduled.
- Decision on whether `/lab/*` stays blocked in Production.
- Separate Preview and Production secrets.
- Production log review policy for financial/provider routes.

## Local Validation Before Preview

Run before creating the first private Preview:

- `npm run build`
- `npx tsc --noEmit`
- `node scripts/check-vercel-security-gate.mjs`
- `git diff --check`
