# Service Role Usage

Updated: 2026-07-24, Phase 1 local implementation.

## Construction inventory

Before Phase 1: six independent service-role client constructions.
After Phase 1: one construction in `lib/supabase/admin.ts`.

The canonical module imports `server-only`, validates configuration, disables
session persistence/refresh, and does not export the key.

| Consumer | Purpose | Authorization before privileged use | Assessment |
|---|---|---|---|
| `app/api/plaid/exchange-public-token/route.ts` | Persist encrypted Plaid connection after exchange | Valid Origin + `auth.getUser()` | Required because encrypted token columns are server-only. |
| `app/api/plaid/sync-imports/route.ts` | Read encrypted tokens; sync/upsert lifecycle rows | HTTP wrapper requires Origin + session; exported worker is server-only and receives a server-derived user ID | Required for background/orchestrated execution. |
| `lib/plaid-sync/orchestrator.ts` | Persist sync locks/results and run background steps | Manual caller validates session; daily caller validates exact cron bearer | Required; module imports `server-only`. |
| `app/api/gmail/ath-import/route.ts` | Read blocked global rule catalog and upsert Gmail lineage | Valid Origin + active household owner | Required while `ath_movil_rules` remains server-only. User and household lineage are derived server-side. |
| `app/api/plaid/sync/daily/route.ts` | Enumerate active Plaid users | Exact `Bearer CRON_SECRET` before admin-client construction | Required server-triggered operation. |

## Removed privileged use

`app/api/plaid/connections/route.ts` now uses the authenticated server client,
an explicit caller `user_id` filter, and RLS. Service role was unnecessary.

## Key-handling assertions

- No client component imports `lib/supabase/admin.ts`.
- No `NEXT_PUBLIC_` variable contains the service key.
- Plaid/Gmail tokens are never returned by the admin module.
- Repository application code references `SUPABASE_SERVICE_ROLE_KEY` only in
  `lib/supabase/admin.ts`.
