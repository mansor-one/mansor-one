# Plaid Repair Timestamp Rollback

Status: documentation only; do not execute without explicit approval

## Rollback SQL

```sql
alter table public.plaid_connections
  drop column if exists last_sync_attempt_at,
  drop column if exists last_repair_success_at;
```

## Impact

This rollback removes only the two additive repair-observability columns. It
does not delete Plaid Items, connections, accounts, transactions, cursors, or
financial history. Values recorded in these two columns after deployment would
be lost, so export them first if audit retention is required.

The application code and generated Supabase types reference both columns.
Rollback must therefore be coordinated with an application rollback that
removes those reads/writes. Dropping the columns while the current application
is running would cause runtime database errors.

## Safe sequence

1. Stop or drain application writes for the affected release.
2. Deploy the previous application version that does not reference the columns.
3. Execute the rollback SQL in a reviewed maintenance window.
4. Verify the Plaid connections page, Link Update Mode, account sync, and
   transaction sync.
5. Confirm no financial records or Plaid Items changed.

The rollback has not been run.
