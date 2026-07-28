import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260725145521_plaid_reconciliation_obligations_select_privilege.sql',
    import.meta.url
  ),
  'utf8'
)

test('obligations reconciliation migration grants only SELECT to service_role', () => {
  assert.match(
    migration,
    /grant select\s+on table public\.obligations\s+to service_role;/i
  )
  assert.equal((migration.match(/\bgrant\b/gi) || []).length, 1)
  assert.doesNotMatch(
    migration,
    /\bgrant\s+all\b|\b(insert|update|delete|truncate|references|trigger)\b/i
  )
})

test('obligations privilege migration does not change RLS or policies', () => {
  assert.doesNotMatch(
    migration,
    /\b(create|alter|drop)\s+policy\b|\b(enable|disable|force)\s+row\s+level\s+security\b/i
  )
  assert.doesNotMatch(migration, /\brevoke\b/i)
  assert.doesNotMatch(migration, /\b(insert|update|delete)\s+public\./i)
})
