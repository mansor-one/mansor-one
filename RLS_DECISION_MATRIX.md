# RLS Decision Matrix

Current live state for every table below: RLS enabled, zero policies, zero rows,
and no `SELECT/INSERT/UPDATE/DELETE` grant to `anon` or `authenticated`.

The immediate recommendation is intentionally conservative: keep every table
blocked. Tables that may become household features should receive
`household_id` only when a real consumer and authoritative backfill relationship
exist.

| Table | Meaning / usage found | Classification now | Future scope if activated | Operation decision |
|---|---|---|---|---|
| `account_snapshots` | Legacy balance history; no app consumer | Server-only / blocked | Household via `account_id` or `credit_card_id` | No client policies now. Future SELECT/INSERT only; UPDATE/DELETE administrative. |
| `ath_movil_matches` | Legacy ATH-to-transaction matching; no consumer | Server-only / blocked | Household derived from both linked records | No client policies. If activated, SELECT and explicit decision UPDATE; server INSERT. |
| `ath_movil_rules` | Read by Gmail import with service role | Server-only reference | Global server catalog unless household customization is designed | Service SELECT only. No client policies. |
| `categories` | Legacy catalog; canonical app registry is elsewhere | Server-only legacy catalog | Shared read-only catalog only if intentionally revived | No client policies. Prefer `transaction_categories`/code registry. |
| `events` | Legacy family-event model; no consumer | Server-only / blocked | Household via authoritative person or explicit household | No policies now. Separate CRUD only after activation. |
| `fixed_expenses` | Legacy obligations model; no consumer | Server-only / blocked | Household via responsible person plus explicit lineage | No policies now. Do not expose alongside canonical obligations. |
| `monthly_documents` | Document metadata without owner relationship or storage object | Server-only / blocked | Household plus storage-object ownership | No policies until document/storage authorization is designed. |
| `pablo_questions` | Retired advisor history; API returns 410 | Server-only / retired | User-scoped with `(select auth.uid()) = user_id` only if revived | No policies now. Future separate SELECT/INSERT/UPDATE/DELETE. |
| `plaid_category_rules` | Unused Plaid mapping catalog | Server-only reference | Global server catalog | Service SELECT only if adopted. |
| `plaid_items` | Legacy plaintext Plaid token table; empty | Server-only / retired | Never client-accessible | No client policies. Do not write plaintext tokens. |
| `raw_transactions` | Legacy statement staging; no consumer | Server-only / blocked | Household through statement/account/card lineage | No policies until an import workflow exists. Future server INSERT, household SELECT/review UPDATE. |
| `recommendations` | Legacy unscoped recommendation rows; no consumer | Server-only / retired | Household only if regenerated from canonical context | No policies. Prefer derived Robototina context. |
| `reminders` | Polymorphic legacy reminders; no enforceable FK ownership | Server-only / blocked | Household with explicit household column and validated related entity | No policies until polymorphic lineage is constrained. |
| `statement_imports` | Legacy statement metadata; no consumer | Server-only / blocked | Household assigned at upload/session creation | No policies now. Future server INSERT and household SELECT. |
| `transactions` | Legacy ledger; official confirmed ledger is `quick_entries` | Server-only / retired | Household only if formally unified | No policies. Avoid a second writable ledger. |
| `variable_income` | Legacy income model; canonical source is `income_schedule` | Server-only / retired | Household only if migrated into canonical income | No policies. Avoid parallel income truth. |

## Existing active-policy review

- All active policies target `authenticated`; none targets `anon`.
- No live `USING (true)` or `WITH CHECK (true)` exists.
- Household SELECT uses `private.is_household_member(household_id)`.
- INSERT/UPDATE/DELETE uses `private.can_write_household(household_id)`.
- UPDATE includes both `USING` and `WITH CHECK`.
- `household_id` and legacy `user_id` reassignment is protected by a trigger on
  the currently hardened table set.
- No public views exist that could bypass RLS.

## Remaining RLS design concerns

1. Household `member` has the same row mutation rights as `owner`; confirm this
   is intentional for destructive operations.
2. Audit/event tables should not inherit blanket UPDATE/DELETE.
3. `authenticated` currently retains `TRUNCATE`, `TRIGGER` and `REFERENCES`
   grants on the zero-policy tables. These are not exposed through PostgREST,
   but violate least privilege and are revoked in the proposal.
4. Application `.eq('user_id', user.id)` filters are narrower than RLS. They
   prevent exposure but can make same-household sharing incomplete.
5. The root missing-table migration should not be applied as written: it turns
   inactive legacy tables into household CRUD surfaces.
