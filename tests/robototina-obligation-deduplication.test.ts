import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { projectedCanonicalInstances } from '../lib/finance/paymentLifecycle.ts'
import { buildMansorDecisionsV1FromSnapshot } from '../lib/financial-engine/decision-engine-v1.ts'
import { activeScheduledPaymentRows } from '../lib/financial-engine/legacy-obligation-migration.ts'
import { deduplicateLifecyclePaymentsByFinancialIdentity } from '../lib/financial-engine/payment-financial-identity.ts'
import type { FinancialEngineSnapshot } from '../lib/financial-engine/snapshot.ts'
import { buildTimelineProjectionFromLiquidity } from '../lib/financial-engine/timeline.ts'
import type { PaymentInstance } from '../lib/financial-engine/types.ts'

const emptyIncome = {
  allIncome: [], expectedIncome: [], receivedIncome: [], missedIncome: [],
  cancelledIncome: [], projectedIncome: [], totalProjectedIncome: 0,
}

function legacyWater(overrides: Partial<PaymentInstance> = {}): PaymentInstance {
  return {
    id: '00000000-0000-4000-8000-000000000101',
    name: 'Servicio Agua Legacy',
    amount: 100,
    owner: 'household',
    status: 'pending',
    due_date: '2026-06-22',
    effective_due_date: '2026-06-22',
    payment_month: 6,
    payment_year: 2026,
    scheduled_payment_id: '00000000-0000-4000-8000-000000000102',
    source: 'payment_instance',
    isOverdue: true,
    userActionRequired: true,
    ...overrides,
  }
}

function canonicalWater(overrides: Partial<PaymentInstance> = {}): PaymentInstance {
  return {
    id: 'obligation:00000000-0000-4000-8000-000000000103',
    name: 'Servicio Agua',
    amount: 100,
    owner: 'household',
    status: 'pending',
    due_date: '2026-07-22',
    effective_due_date: '2026-07-22',
    payment_month: 7,
    payment_year: 2026,
    source: 'obligation',
    obligationId: '00000000-0000-4000-8000-000000000104',
    obligationInstanceId: '00000000-0000-4000-8000-000000000103',
    legacySourceIds: [
      'scheduled_payments.00000000-0000-4000-8000-000000000102',
    ],
    isOverdue: true,
    userActionRequired: true,
    ...overrides,
  }
}

function snapshotFor(payments: PaymentInstance[]): FinancialEngineSnapshot {
  return {
    generatedAt: '2026-07-30T12:00:00.000Z',
    lifecyclePayments: payments,
    projectedIncome: [],
    decisionEngineV1: [],
    liquidity: {
      lifecyclePayments: payments,
      projectedIncome: [],
      connectedAccounts: [],
      resultToday: 1000,
      resultAfterIncome: 1000,
    },
    reviewQueue: {
      statistics: { totalCandidates: 0, autoConfirmable: 0, manualReviewCount: 0, duplicateCount: 0, athCount: 0, paymentMatches: 0 },
      readyToConfirmCount: 0, needsCategoryCount: 0, possibleDuplicateCount: 0,
      athReviewCount: 0, paymentConfirmationCount: 0, needsManualReviewCount: 0,
    },
    portfolio: { totalLiquidAvailable: 1000 },
    planning: { planningItems: [], totalFutureObligations: 0 },
    dashboard: {},
    timeline: {
      startingCash: 1000,
      finalBalance: 970.12,
      minimumBalance: 970.12,
      events: [],
      explanation: {
        lowestPoint: {
          date: null, balance: 970.12, payments: [], incomeEvents: [], text: '',
        },
      },
    },
    financialSummary: {},
  } as unknown as FinancialEngineSnapshot
}

test('June and July remain separate because a commitment link is not a cycle link', () => {
  const rawPayments = [
    legacyWater(),
    canonicalWater(),
  ]
  const payments = deduplicateLifecyclePaymentsByFinancialIdentity(rawPayments)
  const decisions = buildMansorDecisionsV1FromSnapshot(snapshotFor(rawPayments))

  assert.deepEqual(payments.map((payment) => payment.id), rawPayments.map((payment) => payment.id))
  assert.deepEqual(decisions.map((decision) => decision.id), [
    'payment-overdue:00000000-0000-4000-8000-000000000101',
    'payment-overdue:obligation:00000000-0000-4000-8000-000000000103',
  ])
  assert.deepEqual(decisions.map((decision) => decision.title), [
    'Servicio Agua — junio está vencida',
    'Servicio Agua — julio está vencida',
  ])
  assert.equal(payments.reduce((total, payment) => total + Number(payment.amount), 0), 200)
})

test('same commitment and same cycle keep the canonical occurrence', () => {
  const canonicalJune = canonicalWater({
    due_date: '2026-06-22', effective_due_date: '2026-06-22',
    payment_month: 6,
  })
  assert.deepEqual(
    deduplicateLifecyclePaymentsByFinancialIdentity([legacyWater(), canonicalJune]).map(
      (payment) => payment.id
    ),
    [canonicalJune.id]
  )
})

test('a different legacy cycle is excluded only by an explicit instance replacement marker', () => {
  const canonical = canonicalWater()
  const legacy = legacyWater({
    notes: `carry_forward_to_obligation_instance.${canonical.obligationInstanceId}`,
  })
  assert.deepEqual(
    deduplicateLifecyclePaymentsByFinancialIdentity([legacy, canonical]).map(
      (payment) => payment.id
    ),
    [canonical.id]
  )
})

test('a migrated legacy schedule is excluded from new projections while history remains available', () => {
  const legacy = legacyWater()
  const sourceRows = [legacy]
  const schedules = [{
    id: String(legacy.scheduled_payment_id),
    is_active: true,
    notes: 'migrated_to_obligation.00000000-0000-4000-8000-000000000104',
  }]

  assert.equal(activeScheduledPaymentRows(schedules).length, 0)
  assert.equal(sourceRows[0], legacy)
  assert.equal(sourceRows[0].status, 'pending')
})

test('different water obligations are not merged without a structured link', () => {
  const unrelatedCanonical = canonicalWater({
    id: 'obligation:other-water',
    obligationId: 'other-water',
    obligationInstanceId: 'other-water-july',
    name: 'Servicio Agua Secundario',
    legacySourceIds: [],
  })

  assert.equal(
    deduplicateLifecyclePaymentsByFinancialIdentity([
      legacyWater(),
      unrelatedCanonical,
    ]).length,
    2
  )
})

test('different canonical cycles remain separate', () => {
  const july = canonicalWater()
  const august = canonicalWater({
    id: 'obligation:water-august',
    obligationInstanceId: 'water-august',
    due_date: '2026-08-22',
    effective_due_date: '2026-08-22',
    payment_month: 8,
    isOverdue: false,
  })

  assert.deepEqual(
    deduplicateLifecyclePaymentsByFinancialIdentity([july, august]).map(
      (payment) => payment.id
    ),
    [july.id, august.id]
  )
})

test('a paid canonical cycle does not reappear while a different pending legacy cycle remains', () => {
  const payments = deduplicateLifecyclePaymentsByFinancialIdentity([
    legacyWater(),
    canonicalWater({
      status: 'reconciled',
      lifecycleState: 'reconciled',
      lifecycleIsClosed: true,
      userActionRequired: false,
      countsAsUnpaidRisk: false,
    }),
  ])

  const decisions = buildMansorDecisionsV1FromSnapshot(snapshotFor(payments))
  assert.deepEqual(
    decisions.filter((decision) => decision.id.startsWith('payment-overdue:')).map(
      (decision) => decision.id
    ),
    [`payment-overdue:${legacyWater().id}`]
  )
})

test('a paid legacy cycle does not produce an overdue recommendation', () => {
  const legacy = legacyWater({
    status: 'paid', lifecycleIsClosed: true, userActionRequired: false,
    countsAsUnpaidRisk: false,
  })
  const decisions = buildMansorDecisionsV1FromSnapshot(
    snapshotFor([legacy, canonicalWater()])
  )
  assert.equal(
    decisions.some((decision) => decision.id === `payment-overdue:${legacy.id}`),
    false
  )
})

test('Dashboard, Timeline and Robototina preserve both pending service cycles', () => {
  const payments = deduplicateLifecyclePaymentsByFinancialIdentity([
    legacyWater(),
    canonicalWater(),
  ])
  const liquidity = {
    cashAvailableTotal: 1000,
    cashAvailablePlaid: 1000,
    cashAvailableManual: 0,
    income: emptyIncome,
    lifecyclePayments: payments,
  }
  const timeline = buildTimelineProjectionFromLiquidity(liquidity, {
    today: '2026-07-30',
    horizonDays: 45,
  })
  const robototina = buildMansorDecisionsV1FromSnapshot(snapshotFor(payments))
  const dashboardSource = readFileSync(
    new URL('../lib/financial-engine/dashboard.ts', import.meta.url),
    'utf8'
  )

  assert.match(dashboardSource, /return \{\s*liquidity,/)
  assert.equal(liquidity.lifecyclePayments.length, 2)
  assert.equal(timeline.trustedPayments.length, 2)
  assert.equal(robototina.filter((item) => item.id.startsWith('payment-overdue:')).length, 2)
  assert.equal(
    liquidity.lifecyclePayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    200
  )
})

test('canonical recurrence projects future cycles only after an initial instance exists', () => {
  const profile = {
    id: 'water-obligation', user_id: 'user', name: 'Servicio Agua',
    description: null, category_code: 'utilities_water', owner: 'household',
    obligation_type: 'utility', default_amount: 100,
    amount_is_estimated: false, frequency: 'monthly', due_day: 22,
    grace_period_days: 0, payment_method: null, is_active: true,
    notes: 'Legacy active_months:all', created_at: null, updated_at: null,
    providers: [], currentProvider: null,
    instances: [{
      id: 'water-july', user_id: 'user', obligation_id: 'water-obligation',
      provider_id: null, expected_date: '2026-07-22',
      effective_due_date: '2026-07-22', amount_expected: 100,
      amount_is_estimated: false, status: 'pending', source: 'generated',
      notes: null, created_at: null, updated_at: null,
    }],
  }
  const summary = {
    asOfDate: '2026-07-30', active: [profile], allInstances: [],
    upcoming: [], overdue: [], gracePeriod: [], estimated: [], completed: [],
  }

  assert.deepEqual(
    projectedCanonicalInstances(summary as never, '2026-09-30').map(
      (instance) => instance.expected_date
    ),
    ['2026-08-22', '2026-09-22']
  )
  assert.equal(
    projectedCanonicalInstances({ ...summary, active: [{ ...profile, instances: [] }] } as never, '2026-09-30').length,
    0
  )
})
