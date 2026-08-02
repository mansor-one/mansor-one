import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  resolvedPlaidSyncSummary,
  summaryFromPlaidStepResults,
} from '../lib/plaid-sync/summary.ts'
import { plaidConnectionRefreshKey } from '../lib/plaid-sync/ui-refresh.ts'

const orchestrator = readFileSync(new URL('../lib/plaid-sync/orchestrator.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../migrations/20260720_plaid_sync_orchestrator.sql', import.meta.url), 'utf8')
const ui = readFileSync(new URL('../app/plaid/PlaidSyncActions.tsx', import.meta.url), 'utf8')
const plaidPage = readFileSync(
  new URL('../app/plaid/page.tsx', import.meta.url),
  'utf8'
)

test('Plaid orchestration order is deterministic', () => {
  const positions = ['accounts', 'liabilities', 'transactions', 'reconciliation', 'financial_refresh'].map((step) => orchestrator.indexOf(`id: '${step}'`))
  assert.ok(positions.every((position) => position >= 0))
  assert.deepEqual([...positions].sort((a, b) => a - b), positions)
  assert.match(
    orchestrator,
    /syncPlaidImportsForUser\(userId,\s*\{[\s\S]*?reconcile:\s*false,[\s\S]*?deferConnectionSuccessMetadata:\s*true/
  )
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
  assert.match(orchestrator, /summary:\s*summaryFromPlaidStepResults\(results\)/)
  assert.match(orchestrator, /syncPlaidImportsForUser\(userId,\s*\{[\s\S]*reconcile:\s*false/)
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
  assert.match(ui, /Completado con advertencias/)
})

test('summary counts only added plus modified transactions', () => {
  assert.deepEqual(
    summaryFromPlaidStepResults({
      accounts: { synced_accounts: 5 },
      liabilities: { synced_credit_liabilities: 0 },
      transactions: {
        transactions_returned_by_plaid: 24,
        new_imports_created: 22,
        modified_imports_updated: 2,
      },
      reconciliation: { payment: { automaticallyReconciled: 0 } },
    }),
    {
      accounts_updated: 5,
      liabilities_updated: 0,
      transactions_added_or_updated: 24,
      payments_reconciled: 0,
    }
  )
})

test('old runs with an empty summary derive values from step results', () => {
  assert.equal(
    resolvedPlaidSyncSummary({
      summary: {},
      stepResults: {
        accounts: { synced_accounts: 5 },
        transactions: {
          new_imports_created: 22,
          modified_imports_updated: 2,
        },
      },
    }).transactions_added_or_updated,
    24
  )
})

test('daily connection metadata excludes archived rows and preserves consent warnings', () => {
  assert.match(orchestrator, /last_sync_attempt_at:\s*attemptedAt/)
  assert.match(orchestrator, /\.is\('archived_at', null\)/)
  assert.match(orchestrator, /\.neq\('status', 'archived'\)/)
  assert.match(orchestrator, /ADDITIONAL_CONSENT_REQUIRED:PRODUCT_LIABILITIES/)
  assert.match(orchestrator, /deferConnectionSuccessMetadata:\s*true/)
})

test('connection metadata updates prove affected rows and log safe before/after state', () => {
  assert.match(
    orchestrator,
    /\.select\('id, last_sync_attempt_at'\)/
  )
  assert.match(
    orchestrator,
    /updated\?\.length \|\| 0[\s\S]*of \$\{before\.length\} expected rows/
  )
  assert.match(
    orchestrator,
    /Plaid connection sync attempt metadata updated/
  )
  assert.match(orchestrator, /before_last_sync_attempt_at/)
  assert.match(orchestrator, /after_last_sync_attempt_at/)
  assert.match(
    orchestrator,
    /Plaid connection outcome metadata update affected 0 rows/
  )
  assert.match(orchestrator, /before_last_sync_at/)
  assert.match(orchestrator, /after_last_sync_at/)
  assert.match(orchestrator, /persisted_warning/)
})

test('Plaid page reads connection metadata directly without a cached alternate dataset', () => {
  assert.match(plaidPage, /\.from\('plaid_connections'\)/)
  assert.match(
    plaidPage,
    /last_sync_at, last_sync_attempt_at, last_repair_success_at, last_sync_error/
  )
  assert.doesNotMatch(
    plaidPage,
    /unstable_cache|use cache|force-static|plaid_items/
  )
})

test('terminal sync polling refreshes the server-rendered Plaid connections', () => {
  assert.match(ui, /useRouter\(\)/)
  assert.match(ui, /fetch\('\/api\/plaid\/sync', \{ cache: 'no-store' \}\)/)
  assert.match(ui, /plaidConnectionRefreshKey\(nextRun\)/)
  assert.match(ui, /router\.refresh\(\)/)
  assert.match(ui, /refreshedConnectionRunKey\.current !== refreshKey/)
})

test('connection refresh keys are emitted once a sync reaches a terminal state', () => {
  const baseRun = {
    id: 'run-1',
    completed_at: null,
  }

  assert.equal(
    plaidConnectionRefreshKey({ ...baseRun, status: 'queued' }),
    null
  )
  assert.equal(
    plaidConnectionRefreshKey({ ...baseRun, status: 'running' }),
    null
  )
  assert.equal(
    plaidConnectionRefreshKey({
      ...baseRun,
      status: 'completed',
      completed_at: '2026-07-31T02:20:32.463Z',
    }),
    'run-1:2026-07-31T02:20:32.463Z'
  )
  assert.equal(
    plaidConnectionRefreshKey({
      ...baseRun,
      status: 'partially_completed',
    }),
    'run-1:partially_completed'
  )
  assert.equal(
    plaidConnectionRefreshKey({ ...baseRun, status: 'failed' }),
    'run-1:failed'
  )
})
