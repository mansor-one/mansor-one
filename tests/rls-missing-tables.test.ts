import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../migrations/20260721_rls_missing_tables_classification.sql', import.meta.url),
  'utf8',
)

const householdScoped = [
  'account_snapshots',
  'ath_movil_matches',
  'events',
  'fixed_expenses',
  'monthly_documents',
  'raw_transactions',
  'reminders',
  'statement_imports',
  'transactions',
  'variable_income',
]

const serverOnly = [
  'ath_movil_rules',
  'categories',
  'plaid_category_rules',
  'plaid_items',
  'recommendations',
]

test('every Advisor table has an explicit authorization classification', () => {
  for (const table of [...householdScoped, 'pablo_questions', ...serverOnly]) {
    assert.match(migration, new RegExp(`'${table}'`))
  }
})

test('household tables receive lineage protection, indexes, and operation policies', () => {
  assert.match(migration, /add column if not exists household_id uuid/i)
  assert.match(migration, /alter column household_id set not null/i)
  assert.match(migration, /execute function private\.enforce_household_scope/i)
  assert.match(migration, /RLS backfill conflict: transactions/i)
  assert.match(migration, /RLS backfill conflict: statement_imports/i)
  assert.match(migration, /_household_id_idx/i)
  assert.match(migration, /for select to authenticated/i)
  assert.match(migration, /for insert to authenticated/i)
  assert.match(migration, /for update to authenticated/i)
  assert.match(migration, /for delete to authenticated/i)
})

test('pablo questions remain genuinely user scoped', () => {
  assert.match(migration, /create policy pablo_questions_user_select/i)
  assert.match(migration, /\(select auth\.uid\(\)\) = user_id/i)
  assert.match(migration, /user_id lineage cannot be reassigned/i)
})

test('server-only tables expose no client data privileges', () => {
  assert.match(migration, /server_only_tables constant text\[\]/i)
  assert.match(migration, /revoke all on table public\.%I from anon/i)
  assert.match(migration, /revoke all on table public\.%I from authenticated/i)
  assert.match(migration, /for all to service_role using \(false\) with check \(false\)/i)
  assert.match(migration, /client_server_only_grant_count/i)
})

test('release gate rejects unclassified, missing, or permissive policies', () => {
  assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)/i)
  assert.doesNotMatch(migration, /with\s+check\s*\(\s*true\s*\)/i)
  assert.match(migration, /missing_external_policy_count/i)
  assert.match(migration, /unexpected_no_policy_count/i)
  assert.match(migration, /unsafe_policy_count/i)
})
