import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const orchestrator = readFileSync(new URL('../lib/plaid-sync/orchestrator.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../migrations/20260720_plaid_sync_orchestrator.sql', import.meta.url), 'utf8')
const ui = readFileSync(new URL('../app/plaid/PlaidSyncActions.tsx', import.meta.url), 'utf8')

test('Plaid orchestration order is deterministic', () => {
  const positions = ['accounts', 'liabilities', 'transactions', 'reconciliation', 'financial_refresh'].map((step) => orchestrator.indexOf(`id: '${step}'`))
  assert.ok(positions.every((position) => position >= 0))
  assert.deepEqual([...positions].sort((a, b) => a - b), positions)
  assert.match(orchestrator, /syncPlaidImportsForUser\(userId, \{ reconcile: false \}\)/)
})

test('database constraints prevent overlap and repeated daily windows', () => {
  assert.match(migration, /plaid_sync_runs_one_active_per_user/)
  assert.match(migration, /where status in \('queued', 'running'\)/)
  assert.match(migration, /plaid_sync_runs_one_daily_window/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /auth\.uid\(\)\) = user_id/)
})

test('partial failure and retry retain completed step results', () => {
  assert.match(orchestrator, /partially_completed/)
  assert.match(orchestrator, /retryable_step: step\.id/)
  assert.match(orchestrator, /prior\?\.step_results/)
  assert.match(orchestrator, /retryOfRunId/)
})

test('progress UX exposes one primary action and five observable steps', () => {
  assert.match(ui, /'Sincronizar ahora'/)
  assert.match(ui, /Cuentas y balances/)
  assert.match(ui, /Tarjetas y préstamos/)
  assert.match(ui, /Transacciones/)
  assert.match(ui, /Conciliación/)
  assert.match(ui, /Actualización financiera/)
  assert.match(ui, /Ver detalles técnicos/)
  assert.doesNotMatch(ui, />Sync now</)
})
