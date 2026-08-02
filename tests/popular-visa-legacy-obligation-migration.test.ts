import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { derivePaymentStateSemantics, paymentCountsAsUnpaidRisk, paymentRequiresUserAction } from '../lib/finance/paymentLifecycle.ts'
import { buildMansorDecisionsV1FromSnapshot } from '../lib/financial-engine/decision-engine-v1.ts'
import { activeScheduledPaymentRows, safeLegacyConfigurationError } from '../lib/financial-engine/legacy-obligation-migration.ts'
import { filterLegacyObligationCandidates } from '../lib/financial-engine/legacy-obligation-candidates.ts'
import type { FinancialEngineSnapshot } from '../lib/financial-engine/snapshot.ts'

const migration = readFileSync(new URL('../supabase/migrations/20260728221600_popular_visa_legacy_obligation_configuration.sql', import.meta.url), 'utf8')
const statementCreditMigration = readFileSync(new URL('../supabase/migrations/20260729013737_allow_legacy_statement_credit_reconciliation.sql', import.meta.url), 'utf8')
const drawer = readFileSync(new URL('../app/components/FinancialObligationDrawer.tsx', import.meta.url), 'utf8')
const configurator = readFileSync(new URL('../app/components/ConfigureLegacyObligation.tsx', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/obligations/configure-legacy/route.ts', import.meta.url), 'utf8')

test('legacy promotion preserves history and requires a real confirmed transaction', () => {
  assert.match(migration, /from public\.quick_entries/)
  assert.match(migration, /p_quick_entry_id uuid/)
  assert.match(migration, /reconciliation_status, confidence/)
  assert.match(migration, /'reconciled', 100/)
  assert.match(migration, /set is_active = false/)
  assert.match(migration, /migrated_to_obligation\./)
  assert.doesNotMatch(migration, /delete\s+from/i)
  assert.doesNotMatch(migration, /insert into public\.quick_entries/i)
})

test('configuration is reachable from the active legacy drawer flow', () => {
  assert.match(drawer, /<ConfigureLegacyObligation payment=\{payment\}/)
  assert.match(configurator, /Transacción real pagada/)
  assert.match(configurator, /No se creará ninguna transacción/)
  assert.match(configurator, /Crear una obligación canónica nueva/)
  assert.match(configurator, /Advertencia:/)
  assert.match(configurator, /Puedes continuar porque la selección es manual/)
  assert.match(configurator, /type="search"/)
  assert.match(configurator, /autoComplete="off"/)
  assert.match(configurator, /La búsqueda textual no coincidió/)
})

test('Popular Visa text search falls back to confirmed exact-amount candidates', () => {
  const result = filterLegacyObligationCandidates([
    { entry_date: '2026-06-08', description: 'Payment evidence A', amount: 361, account_name: 'Account A', exactAmount: true },
    { entry_date: '2026-07-03', description: 'Different movement', amount: 100, account_name: 'Account B', exactAmount: false },
  ], 'Popular Visa')

  assert.equal(result.usedExactAmountFallback, true)
  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].amount, 361)
})

test('candidate search is broad but excludes unsafe or already-linked entries', () => {
  assert.match(route, /dateOffset\(expectedDate, -180\)/)
  assert.match(route, /dateOffset\(expectedDate, 180\)/)
  assert.match(route, /from\('quick_entries'\)/)
  assert.match(route, /eq\('household_id', schedule\.household_id\)/)
  assert.match(route, /neq\('entry_type', 'transfer'\)/)
  assert.match(route, /classifyDebtReductionCredit/)
  assert.match(route, /if \(entry\.entry_type !== 'income'\) return true/)
  assert.match(route, /financialImpact: entry\.entry_type === 'income'/)
  assert.match(route, /from\('obligation_payment_links'\)/)
  assert.match(route, /filter\(\(entry\) => !linkedEntryIds\.has\(entry\.id\)\)/)
  assert.match(migration, /This transaction is already linked to an obligation/)
  assert.match(migration, /household_id = v_household_id/)
})

test('legacy RPC errors expose a safe concrete cause without sensitive details', () => {
  const result = safeLegacyConfigurationError({
    code: 'P0002',
    message: 'Confirmed payment transaction not found',
    details: 'sensitive database detail',
  })
  assert.deepEqual(result, {
    status: 409,
    code: 'legacy_evidence_not_accepted',
    message: 'La transacción seleccionada existe, pero el flujo legacy todavía no acepta este tipo de evidencia financiera.',
  })
  assert.doesNotMatch(JSON.stringify(result), /sensitive database detail/)
})

test('legacy statement-credit migration accepts only authoritative card credits', () => {
  assert.match(statementCreditMigration, /q\.amount < 0/)
  assert.match(statementCreditMigration, /source\.pending is false/)
  assert.match(statementCreditMigration, /source\.transaction_status = 'active'/)
  assert.match(statementCreditMigration, /like '%credit%'/)
  assert.match(statementCreditMigration, /PAYYOURSELFBACK/)
  assert.match(statementCreditMigration, /'evidence_kind'[\s\S]*statement_credit/)
  assert.match(statementCreditMigration, /'applied_amount', least\(abs\(v_quick_entry\.amount\), p_default_amount\)/)
  assert.match(statementCreditMigration, /'excess_unallocated', greatest\(abs\(v_quick_entry\.amount\) - p_default_amount, 0\)/)
  assert.doesNotMatch(statementCreditMigration, /delete\s+from/i)
  assert.doesNotMatch(statementCreditMigration, /alter\s+table/i)
})

test('archived Popular Visa legacy schedule cannot reappear as overdue', () => {
  const legacySchedule = {
    id: 'popular-visa-legacy', name: 'Popular Visa', amount: 361,
    due_day: 8, grace_day: 8, is_active: false,
  }
  const closedInstance = {
    id: 'obligation:popular-visa-july', name: 'Popular Visa', amount: 361,
    status: 'closed', due_date: '2026-07-08', expected_date: '2026-07-08',
    effective_due_date: '2026-07-08', source: 'obligation' as const,
    obligationInstanceId: 'popular-visa-july',
    ...derivePaymentStateSemantics({ lifecycleState: 'reconciled', status: 'closed' }),
    lifecycleState: 'reconciled', lifecycleIsClosed: true, lifecycleIsOpen: false,
  }

  assert.deepEqual(activeScheduledPaymentRows([legacySchedule]), [])
  assert.equal(paymentRequiresUserAction(closedInstance), false)
  assert.equal(paymentCountsAsUnpaidRisk(closedInstance), false)
})

test('closed migrated payment produces no Dashboard risk or Robototina overdue recommendation', () => {
  const payment = {
    id: 'popular-visa-july', name: 'Popular Visa', amount: 361,
    status: 'closed', effective_due_date: '2026-07-08', isOverdue: false,
    lifecycleState: 'reconciled', lifecycleIsOpen: false, lifecycleIsClosed: true,
    ...derivePaymentStateSemantics({ lifecycleState: 'reconciled', status: 'closed' }),
  }
  const snapshot = {
    generatedAt: '2026-07-28T12:00:00.000Z', lifecyclePayments: [payment],
    projectedIncome: [], decisionEngineV1: [],
    liquidity: { lifecyclePayments: [payment], projectedIncome: [], connectedAccounts: [], resultToday: 1000, resultAfterIncome: 1000 },
    timeline: { startingCash: 1000, finalBalance: 1000, minimumBalance: 1000, events: [], explanation: { lowestPoint: { date: null, balance: 1000, payments: [], incomeEvents: [], text: '' } } },
    portfolio: { totalLiquidAvailable: 1000 }, planning: { planningItems: [], totalFutureObligations: 0 },
    reviewQueue: { statistics: { totalCandidates: 0, autoConfirmable: 0, manualReviewCount: 0, duplicateCount: 0, athCount: 0, paymentMatches: 0 }, readyToConfirmCount: 0, needsCategoryCount: 0, possibleDuplicateCount: 0, athReviewCount: 0, paymentConfirmationCount: 0, needsManualReviewCount: 0 },
    dashboard: { totalPendingPayments: 0 }, financialSummary: {},
  } as unknown as FinancialEngineSnapshot

  const decisions = buildMansorDecisionsV1FromSnapshot(snapshot)
  assert.equal(paymentCountsAsUnpaidRisk(payment), false)
  assert.equal(decisions.some((decision) => decision.id.includes('popular-visa')), false)
})
