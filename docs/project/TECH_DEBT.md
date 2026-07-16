# Mansor One Technical Debt

Last updated: 2026-07-16

## P0

No unresolved P0 items remain after Phase 0 validation.

Resolved in Phase 0:

- Global lint now passes.
- `/goals` no longer reads/writes Supabase from a Client Component.
- Legacy guard now ignores historical documentation references and passes.

## P1

- Client-side legacy pages still import the browser Supabase client and query
  financial tables directly: `/accounts`, `/quick-entry`,
  `/payment-instances`, `/imports`. These are the next highest architecture
  cleanup after `/goals`.
- Server-rendered legacy pages still query financial tables directly instead
  of consuming official helpers/view models: `/assets`, `/priorities`,
  `/cashflow`, `/payments`, `/future-obligations`, `/health-score`,
  `/ath-movil`.
- Dashboard has many view-model helpers in `app/page.tsx`.
- Spending and History resolve categories and period totals in page/client code.
- Plaid has no webhook route or retry model.
- Gmail/ATH import mode is not production-decided.
- Service-role routes need explicit ownership review.
- No first-party tests.

## P2

- Product Shell is shared, but internal content uses mixed legacy styles.
- README/docs index are stale.
- Data Health needs live authenticated findings captured in docs.
- Debt Strategy depends on missing APR/due/minimum metadata.
- Transfer ledger is missing.
- Root contains accidental empty files.

## P3

- Some labels remain English in management-heavy pages.
- Several docs overlap historically and need consolidation after audit.
- `next.config.ts` is empty; deployment decisions are in docs only.

## Recommended cleanup sequence

1. Checkpoint current work.
2. Quarantine or migrate remaining legacy direct-read pages.
3. Run authenticated Data Health and create repair backlog.
4. Update README/docs index.
5. Run Data Health live and create repair backlog.
6. Polish Product Shell content page by page.
