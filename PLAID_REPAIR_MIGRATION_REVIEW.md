# Plaid Repair Migration Review

Reviewed: 2026-07-25
Migration: `supabase/migrations/20260725033424_plaid_connection_repair_timestamps.sql`
Status: applied to the linked Supabase project on 2026-07-25

## Findings

The migration performs one additive `ALTER TABLE` and adds comments:

- `last_sync_attempt_at timestamptz`
- `last_repair_success_at timestamptz`

Both columns are nullable because neither has a `NOT NULL` constraint. Neither
has a default, and the migration contains no `now()` expression. Existing rows
therefore retain their existing values and receive `NULL` for both new columns.

The SQL contains no `INSERT`, `UPDATE`, `DELETE`, backfill, trigger, function,
constraint, index, grant, RLS statement, or policy statement. It does not rewrite
an existing row. `ADD COLUMN IF NOT EXISTS` also makes repeated migration SQL
execution structurally idempotent, although normal migration history should
remain the execution authority.

## Scope and locking

PostgreSQL must acquire a table lock to alter `public.plaid_connections`.
Because the columns are nullable and have no default, the operation is metadata
only and does not require a table-data rewrite. Application of any migration
still requires a scheduled, approved deployment step.

## Automated guard

`tests/plaid-update-mode.test.ts` verifies:

- both timestamp columns are present;
- `NOT NULL`, `DEFAULT`, and `now()` are absent;
- data mutation statements are absent;
- RLS and policy statements are absent.

Rollback is documented separately in `PLAID_REPAIR_ROLLBACK.md`.

## Application evidence

`npx supabase db push --dry-run` reported this migration as the only pending
migration. The subsequent approved `npx supabase db push` applied only
`20260725033424_plaid_connection_repair_timestamps.sql`.

Read-back from `information_schema.columns` confirmed both columns are
`timestamp with time zone`, nullable, and have `column_default = NULL`.
Supabase migration history records version `20260725033424` as
`plaid_connection_repair_timestamps`.
