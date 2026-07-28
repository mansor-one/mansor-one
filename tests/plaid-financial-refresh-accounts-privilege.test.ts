import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260725151012_plaid_financial_refresh_accounts_select_privilege.sql',
    import.meta.url
  ),
  'utf8'
)

const orchestrator = readFileSync(
  new URL('../lib/plaid-sync/orchestrator.ts', import.meta.url),
  'utf8'
)

const accounts = readFileSync(
  new URL('../lib/financial-engine/accounts.ts', import.meta.url),
  'utf8'
)

test('financial_refresh reads public.accounts through getManualAccounts', () => {
  assert.match(
    orchestrator,
    /step\.id === 'financial_refresh'[\s\S]*getFinancialEngineSnapshot\(supabase, userId\)/
  )
  assert.match(
    accounts,
    /function getManualAccounts[\s\S]*\.from\('accounts'\)[\s\S]*\.select\('\*'\)/
  )
})

test('accounts financial_refresh migration grants exactly SELECT to service_role', () => {
  assert.match(
    migration,
    /grant select\s+on table public\.accounts\s+to service_role;/i
  )
  assert.equal((migration.match(/\bgrant\b/gi) || []).length, 1)
  assert.doesNotMatch(
    migration,
    /\bgrant\s+all\b|\b(insert|update|delete|truncate|references|trigger)\b/i
  )
})

test('accounts privilege migration does not change RLS or policies', () => {
  assert.doesNotMatch(
    migration,
    /\b(create|alter|drop)\s+policy\b|\b(enable|disable|force)\s+row\s+level\s+security\b/i
  )
  assert.doesNotMatch(migration, /\brevoke\b/i)
  assert.doesNotMatch(migration, /\b(insert|update|delete)\s+public\./i)
})
