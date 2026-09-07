import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { derivePaymentStateSemantics, paymentCountsAsUnpaidRisk, paymentRequiresUserAction } from '../lib/finance/paymentLifecycle.ts'
import { buildMansorDecisionsV1FromSnapshot } from '../lib/financial-engine/decision-engine-v1.ts'
import { activeScheduledPaymentRows, safeLegacyConfigurationError } from '../lib/financial-engine/legacy-obligation-migration.ts'
import {
  deduplicateLegacyObligationCandidates,
  filterLegacyObligationCandidates,
  isEligibleUnpromotedPlaidCandidate,
  rankLegacyObligationCandidates,
} from '../lib/financial-engine/legacy-obligation-candidates.ts'
import { promoteBeforeLinkingLegacyObligation } from '../lib/financial-engine/legacy-obligation-promotion.ts'
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
  assert.match(configurator, /No se inventará ninguna transacción/)
  assert.match(configurator, /Crear una obligación canónica nueva/)
  assert.match(configurator, /Pago real \{money\(selectedCandidate\.amount\)\}/)
  assert.match(configurator, /Confirmo manualmente que este importe diferente corresponde al pago real/)
  assert.match(configurator, /La obligación usa un importe fijo de/)
  assert.match(configurator, /Se requiere confirmación manual/)
  assert.match(configurator, /type="search"/)
  assert.match(configurator, /autoComplete="off"/)
  assert.match(configurator, /La búsqueda textual no coincidió/)
})

test('confirmed quick entries and eligible unpromoted Plaid imports are both candidates', () => {
  const confirmed = [{
    id: 'quick-1', source: 'quick_entries' as const, entry_date: '2026-08-02',
    description: 'AAA MOVIL', amount: 40, account_name: 'Cuenta Perfecta',
    exactAmount: false, plaid_transaction_id: 'plaid-quick',
  }]
  const pending = [{
    id: 'plaid-1', source: 'plaid_imports' as const, entry_date: '2026-08-03',
    description: 'AAA MOVIL', amount: 40, account_name: 'Cuenta Perfecta',
    exactAmount: false, plaid_transaction_id: 'plaid-pending',
  }]
  const result = deduplicateLegacyObligationCandidates(confirmed, pending)

  assert.equal(result.length, 2)
  assert.equal(result[0].source, 'quick_entries')
  assert.equal(result[1].source, 'plaid_imports')
})

test('confirmed quick entry wins over its duplicate Plaid import', () => {
  const confirmed = [{
    id: 'quick-1', entry_date: '2026-08-03', description: 'AAA MOVIL', amount: 40,
    account_name: 'Cuenta Perfecta', exactAmount: false,
    source: 'quick_entries' as const, plaid_transaction_id: 'same-transaction',
  }]
  const pending = [{
    id: 'plaid-1', entry_date: '2026-08-03', description: 'AAA MOVIL', amount: 40,
    account_name: 'Cuenta Perfecta', exactAmount: false,
    source: 'plaid_imports' as const, plaid_transaction_id: 'same-transaction',
  }]

  assert.deepEqual(
    deduplicateLegacyObligationCandidates(confirmed, pending).map((item) => item.id),
    ['quick-1']
  )
})

test('Agua discovers AAA MOVIL through provider plus encapsulated aliases despite amount difference', () => {
  const [candidate] = rankLegacyObligationCandidates({
    candidates: [{
      id: 'aaa-40', source: 'plaid_imports', entry_date: '2026-08-03',
      description: 'AAA MOVIL', amount: 40, account_name: 'Cuenta Perfecta',
      institution_name: 'FirstBank', category: 'RENT_AND_UTILITIES', exactAmount: false,
    }],
    paymentName: 'Agua',
    expectedAmount: 29.88,
    expectedDate: '2026-06-22',
    amountIsEstimated: false,
    providerName: 'AAA',
    obligationType: 'utility',
    categoryCode: 'utilities_water',
  })

  assert.equal(candidate.contextualMatch, true)
  assert.ok(candidate.reasons?.some((reason) => reason.includes('obligation provider: AAA')))
  assert.equal(candidate.exactAmount, false)
  assert.equal(candidate.amountBehavior, 'fixed')
  assert.equal(candidate.requiresManualConfirmation, true)
  assert.equal(filterLegacyObligationCandidates([candidate], 'Agua').candidates.length, 1)
})

test('legacy payment aliases are isolated behind a replaceable service', () => {
  const reconciliationSource = readFileSync(new URL('../lib/financial-engine/reconciliation.ts', import.meta.url), 'utf8')
  const aliasService = readFileSync(new URL('../lib/financial-engine/obligation-match-aliases.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(reconciliationSource, /PAYMENT_ALIASES/)
  assert.match(reconciliationSource, /obligationMatchTerms/)
  assert.match(aliasService, /Technical debt:/)
  assert.match(aliasService, /agua:\s*\['AGUA', 'AAA', 'PRASA'\]/)
})

test('unpromoted Plaid eligibility is household, lifecycle, and date scoped', () => {
  const base = {
    household_id: 'household-a', imported: false, pending: false,
    transaction_status: 'active', removed_at: null, superseded_at: null,
    transaction_date: '2026-08-03',
  }
  const eligible = (overrides = {}) => isEligibleUnpromotedPlaidCandidate(
    { ...base, ...overrides }, 'household-a', '2025-12-24', '2026-12-19'
  )

  assert.equal(eligible(), true)
  assert.equal(eligible({ household_id: 'household-b' }), false)
  assert.equal(eligible({ imported: true }), false)
  assert.equal(eligible({ pending: true }), false)
  assert.equal(eligible({ transaction_status: 'removed' }), false)
  assert.equal(eligible({ removed_at: '2026-08-04T00:00:00Z' }), false)
  assert.equal(eligible({ superseded_at: '2026-08-04T00:00:00Z' }), false)
  assert.equal(eligible({ transaction_date: '2027-01-01' }), false)
})

test('pending Plaid promotion must succeed before legacy payment linking runs', async () => {
  const calls: string[] = []
  const result = await promoteBeforeLinkingLegacyObligation({
    source: 'plaid_imports',
    candidateId: 'plaid-1',
    promotePlaid: async (id) => { calls.push(`promote:${id}`); return { quickEntryId: 'quick-1' } },
    linkConfirmedQuickEntry: async (id) => { calls.push(`link:${id}`); return 'closed' },
  })

  assert.equal(result, 'closed')
  assert.deepEqual(calls, ['promote:plaid-1', 'link:quick-1'])
})

test('failed pending Plaid promotion leaves the obligation link untouched', async () => {
  let linked = false
  await assert.rejects(() => promoteBeforeLinkingLegacyObligation({
    source: 'plaid_imports',
    candidateId: 'plaid-1',
    promotePlaid: async () => { throw new Error('promotion failed') },
    linkConfirmedQuickEntry: async () => { linked = true },
  }), /promotion failed/)
  assert.equal(linked, false)
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
  assert.match(route, /from\('plaid_imports'\)/)
  assert.match(route, /eq\('household_id', schedule\.household_id\)/)
  assert.match(route, /neq\('entry_type', 'transfer'\)/)
  assert.match(route, /classifyDebtReductionCredit/)
  assert.match(route, /if \(entry\.entry_type !== 'income'\) return true/)
  assert.match(route, /financialImpact: entry\.entry_type === 'income'/)
  assert.match(route, /from\('obligation_payment_links'\)/)
  assert.match(route, /filter\(\(entry\) => !linkedEntryIds\.has\(entry\.id\)\)/)
  assert.match(route, /eq\('imported', false\)/)
  assert.match(route, /eq\('pending', false\)/)
  assert.match(route, /eq\('transaction_status', 'active'\)/)
  assert.match(route, /is\('removed_at', null\)/)
  assert.match(route, /is\('superseded_at', null\)/)
  assert.match(route, /skipReconciliation:\s*true/)
  assert.match(route, /confirmAmountDifference/)
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
