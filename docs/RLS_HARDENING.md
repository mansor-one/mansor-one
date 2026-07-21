# RLS Hardening — household authorization model

## Authorization boundary

- `households.id` is the row-authorization boundary.
- `household_members.auth_user_id` links Supabase Auth users to one household.
- `user_id` remains on financial rows as creator/source lineage; it is no longer the sharing boundary.
- Active `owner` and `member` memberships can read and write household data.
- Active `viewer` memberships can read but cannot insert, update, or delete.
- Anonymous roles receive no privileges on household or financial tables.
- Membership creation, reassignment, and deletion remain server-administrative operations. A client cannot add itself to another household.

The membership lookup functions live in the non-exposed `private` schema. They are `SECURITY DEFINER` only to avoid recursive RLS on `household_members`, use a fixed `search_path`, and expose only boolean/current-user-scoped results.

## Migration order

1. `20260721_household_authorization_foundation.sql`
2. `20260721_rls_household_policies.sql`

The foundation creates one isolated household per existing Auth user. It does not infer that two existing users belong together. An administrator must explicitly move/invite a second user into the intended household.

Historical rows without `user_id` are assigned automatically only when exactly one household exists. If more than one household exists and any row cannot be resolved, the transaction aborts. This is intentional: production data must never be assigned to a household by guesswork.

## Pre-application checks

Run on production using read-only access:

```sql
select count(*) as auth_users from auth.users;
select count(*) as historical_named_members from public.household_members;
```

If there is more than one Auth user, prepare an explicit reviewed user-to-household map before applying. Take a backup and record the migration version.

## Authorization verification

After applying both migrations to a disposable database:

```bash
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f tests/sql/rls_household_authorization.sql
```

The test runs inside a transaction and rolls back. It verifies:

- user A and user B in one household can select, insert, update, and delete shared rows;
- user C in a different household cannot select, insert, update, or delete those rows;
- `anon` cannot read household data.

Then run the Supabase Security Advisor and this release gate:

```sql
select schemaname, tablename, policyname, qual, with_check
from pg_policies
where schemaname = 'public'
  and (
    trim(coalesce(qual, '')) = 'true'
    or trim(coalesce(with_check, '')) = 'true'
  );
```

Expected result: zero rows. The advisor must have no `rls_policy_always_true` or multiple-permissive-policy warning for the migrated tables.

## Application status

The migrations are committed artifacts only and have not been applied to the connected production project. Existing server queries that additionally filter by `user_id` remain narrower than RLS; they cannot expose another household, but a later application-layer household-sharing pass may be needed for every screen to display another member's rows. That pass is separate from this database authorization sprint and must not weaken these policies.
