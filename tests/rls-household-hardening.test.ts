import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const foundation = readFileSync(
  new URL('../migrations/20260721_household_authorization_foundation.sql', import.meta.url),
  'utf8',
)
const policies = readFileSync(
  new URL('../migrations/20260721_rls_household_policies.sql', import.meta.url),
  'utf8',
)

const scopedTables = [
  'accounts',
  'assets',
  'ath_movil_messages',
  'credit_cards',
  'financial_links',
  'future_obligations',
  'liabilities',
  'payment_instances',
  'plaid_imports',
  'quick_entries',
  'scheduled_payments',
]

test('household foundation preserves user lineage and adds an explicit authorization boundary', () => {
  assert.match(foundation, /create table if not exists public\.households/i)
  assert.match(foundation, /add column if not exists household_id uuid/i)
  assert.match(foundation, /add column if not exists auth_user_id uuid/i)
  assert.match(foundation, /private\.is_household_member/i)
  assert.match(foundation, /private\.can_write_household/i)
  assert.match(foundation, /security definer[\s\S]*set search_path = pg_catalog, public/i)
  assert.match(foundation, /household_id cannot be reassigned/i)
  assert.match(foundation, /user_id lineage cannot be reassigned/i)
  assert.match(foundation, /historical household_members are ambiguous/i)
})

test('all known financial surfaces are household scoped', () => {
  for (const table of scopedTables) {
    assert.match(foundation, new RegExp(`'${table}'`))
    assert.match(policies, new RegExp(`'${table}'`))
  }
})

test('policy migration removes anonymous access and creates operation-specific policies', () => {
  assert.match(policies, /revoke all on table public\.%I from anon/i)
  assert.match(policies, /for select to authenticated/i)
  assert.match(policies, /for insert to authenticated/i)
  assert.match(policies, /for update to authenticated/i)
  assert.match(policies, /for delete to authenticated/i)
  assert.match(policies, /private\.is_household_member\(household_id\)/i)
  assert.match(policies, /private\.can_write_household\(household_id\)/i)
})

test('migration contains a release gate against literal true policies', () => {
  assert.doesNotMatch(policies, /using\s*\(\s*true\s*\)/i)
  assert.doesNotMatch(policies, /with\s+check\s*\(\s*true\s*\)/i)
  assert.match(policies, /unsafe_policy_count/i)
  assert.match(policies, /trim\(coalesce\(qual, ''\)\) = 'true'/i)
  assert.match(policies, /trim\(coalesce\(with_check, ''\)\) = 'true'/i)
})
