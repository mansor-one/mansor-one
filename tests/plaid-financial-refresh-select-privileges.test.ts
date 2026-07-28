import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260728204331_plaid_financial_refresh_select_privileges.sql',
    import.meta.url
  ),
  'utf8'
)

const expectedTables = [
  'public.credit_cards',
  'public.payment_instances',
  'public.scheduled_payments',
  'public.income_schedule',
  'public.confirmed_ledger_duplicate_resolutions',
  'public.obligation_providers',
  'public.planning_items',
]

test('financial_refresh migration has one SELECT grant for the exact seven tables', () => {
  assert.equal((migration.match(/\bgrant\b/gi) || []).length, 1)
  assert.equal((migration.match(/\bgrant\s+select\b/gi) || []).length, 1)
  assert.match(migration, /\bto\s+service_role\s*;/i)

  const actualTables = [
    ...migration.matchAll(/\bpublic\.[a-z_]+\b/gi),
  ].map(([table]) => table.toLowerCase())

  assert.deepEqual(actualTables, expectedTables)
})

test('financial_refresh grant contains no broader privileges', () => {
  assert.doesNotMatch(
    migration,
    /\bgrant\s+all\b|\b(insert|update|delete|truncate|references|trigger)\b/i
  )
})

test('financial_refresh grant leaves RLS and policies unchanged', () => {
  assert.doesNotMatch(
    migration,
    /\b(create|alter|drop)\s+policy\b|\b(enable|disable|force)\s+row\s+level\s+security\b/i
  )
  assert.doesNotMatch(migration, /\brevoke\b/i)
})
