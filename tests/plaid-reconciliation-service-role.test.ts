import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  serializePlaidSyncError,
} from '../lib/plaid-sync/error-serialization.ts'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const migration = source(
  'supabase/migrations/20260725121421_plaid_reconciliation_service_role_privileges.sql'
)
const reconciliation = source(
  'lib/financial-engine/obligation-reconciliation-engine.ts'
)
const orchestrator = source('lib/plaid-sync/orchestrator.ts')
const syncUi = source('app/plaid/PlaidSyncActions.tsx')

test('PostgREST errors are stored as safe structured technical details', () => {
  assert.deepEqual(
    serializePlaidSyncError('reconciliation', {
      code: '42501',
      message: 'permission denied for table obligation_instances',
      hint: 'Contact owner@example.test for request 3015d51a-94d1-452a-937b-566661452f1b',
    }),
    {
      stage: 'reconciliation',
      code: '42501',
      message: 'permission denied for table obligation_instances',
      hint: 'Contact [redacted-email] for request [redacted-id]',
    }
  )

  const fallback = serializePlaidSyncError('transactions', {
    unexpected: true,
  })
  assert.equal(fallback.code, 'SYNC_STEP_FAILED')
  assert.equal(fallback.message, 'Synchronization step failed')
  assert.equal(fallback.hint, null)
  assert.doesNotMatch(JSON.stringify(fallback), /\[object Object\]/)
})

test('orchestrator keeps the user message generic and technical details collapsed', () => {
  assert.match(orchestrator, /results\[step\.id\] = \{ error: technicalError \}/)
  assert.match(
    orchestrator,
    /error_message: `No pudimos completar \$\{step\.label\.toLowerCase\(\)\}\.`/
  )
  assert.match(syncUi, /<details/)
  assert.match(syncUi, /Ver detalles técnicos/)
  assert.match(syncUi, /JSON\.stringify\(run, null, 2\)/)
})

test('migration grants exactly the operations used on reconciliation tables', () => {
  assert.match(
    reconciliation,
    /\.from\('obligation_instances'\)[\s\S]*\.select\(/
  )
  assert.match(
    reconciliation,
    /\.from\('obligation_instances'\)\.update\(/
  )
  assert.match(
    reconciliation,
    /\.from\('obligation_payment_links'\)[\s\S]*\.select\(/
  )
  assert.match(
    reconciliation,
    /\.from\('obligation_payment_links'\)\.insert\(/
  )
  assert.match(
    reconciliation,
    /\.from\('obligation_payment_links'\)\.update\(/
  )

  assert.match(
    migration,
    /grant select, update\s+on table public\.obligation_instances\s+to service_role;/i
  )
  assert.match(
    migration,
    /grant select, insert, update\s+on table public\.obligation_payment_links\s+to service_role;/i
  )
})

test('migration adds no broad privileges or RLS and policy changes', () => {
  assert.doesNotMatch(migration, /\bgrant\s+all\b/i)
  assert.doesNotMatch(migration, /\bdelete\b/i)
  assert.doesNotMatch(
    migration,
    /\b(create|alter|drop)\s+policy\b|\b(enable|disable|force)\s+row\s+level\s+security\b/i
  )
  assert.doesNotMatch(migration, /\b(insert|update|delete)\s+public\./i)
})
