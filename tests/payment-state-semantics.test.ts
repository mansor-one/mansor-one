import assert from 'node:assert/strict'
import test from 'node:test'
import {
  derivePaymentStateSemantics,
  paymentCountsAsUnpaidRisk,
  paymentRequiresUserAction,
} from '../lib/finance/paymentLifecycle.ts'
import { buildMansorDecisionsV1FromSnapshot } from '../lib/financial-engine/decision-engine-v1.ts'
import { buildReconciliationMatches } from '../lib/financial-engine/reconciliation.ts'
import { selectAutomaticReconciliations } from '../lib/financial-engine/obligation-reconciliation-engine.ts'
import { buildTimelineProjectionFromLiquidity } from '../lib/financial-engine/timeline.ts'
import type { FinancialEngineSnapshot } from '../lib/financial-engine/snapshot.ts'

function overdueSnapshot() {
  const payment = {
    id: 'past-due-payment', name: 'Internet', amount: 89, status: 'pending',
    effective_due_date: '2026-07-07', isOverdue: true,
    lifecycleState: 'overdue', lifecycleIsOpen: true, lifecycleIsClosed: false,
    lifecycleLabel: 'Overdue',
  }
  return {
    generatedAt: '2026-07-21T12:00:00.000Z',
    lifecyclePayments: [payment], projectedIncome: [], decisionEngineV1: [],
    liquidity: {
      lifecyclePayments: [payment], projectedIncome: [], connectedAccounts: [],
      resultToday: 1000, resultAfterIncome: 1000,
    },
    timeline: {
      startingCash: 1000, finalBalance: 911, minimumBalance: 911, events: [],
      explanation: {
        lowestPoint: { date: null, balance: 911, payments: [], incomeEvents: [], text: '' },
      },
    },
    portfolio: { totalLiquidAvailable: 1000 },
    planning: { planningItems: [], totalFutureObligations: 0 },
    reviewQueue: {
      statistics: {
        totalCandidates: 0, autoConfirmable: 0, manualReviewCount: 0,
        duplicateCount: 0, athCount: 0, paymentMatches: 0,
      },
      readyToConfirmCount: 0, needsCategoryCount: 0, possibleDuplicateCount: 0,
      athReviewCount: 0, paymentConfirmationCount: 0, needsManualReviewCount: 0,
    },
    dashboard: {}, financialSummary: {},
  } as unknown as FinancialEngineSnapshot
}

test('canonical payment semantics separate settlement from user action and risk', () => {
  assert.deepEqual(
    derivePaymentStateSemantics({
      lifecycleState: 'pending_settlement',
      status: 'initiated',
    }),
    {
      settlementState: 'pending_settlement',
      userActionRequired: false,
      countsAsUnpaidRisk: false,
      bankConfirmationPending: true,
    }
  )

  assert.deepEqual(
    derivePaymentStateSemantics({ lifecycleState: 'reconciled', status: 'confirmed' }),
    {
      settlementState: 'reconciled',
      userActionRequired: false,
      countsAsUnpaidRisk: false,
      bankConfirmationPending: false,
    }
  )

  const unpaid = derivePaymentStateSemantics({
    lifecycleState: 'overdue',
    status: 'pending',
  })
  assert.equal(unpaid.userActionRequired, true)
  assert.equal(unpaid.countsAsUnpaidRisk, true)
})

test('past-due pending settlement produces no pay-now or confirm-again recommendation', () => {
  const snapshot = overdueSnapshot()
  snapshot.lifecyclePayments[0] = {
    ...snapshot.lifecyclePayments[0],
    lifecycleState: 'pending_settlement',
    lifecycleIsOpen: true,
    lifecycleIsClosed: false,
    ...derivePaymentStateSemantics({
      lifecycleState: 'pending_settlement',
      status: 'initiated',
    }),
  }

  const decisions = buildMansorDecisionsV1FromSnapshot(snapshot)
  assert.equal(decisions.some((decision) => decision.type === 'pay_now'), false)
  assert.equal(
    decisions.some((decision) =>
      `${decision.recommendation} ${decision.explanation}`
        .toLowerCase()
        .includes('confirm it if it was already paid')
    ),
    false
  )
})

test('pending settlement is visible in transit and contributes zero unpaid risk', () => {
  const pendingSettlement = {
    id: 'pending-settlement',
    name: 'Past-due card payment',
    amount: 300,
    due_date: '2026-07-01',
    status: 'initiated',
    lifecycleState: 'pending_settlement',
    lifecycleIsOpen: true,
    ...derivePaymentStateSemantics({
      lifecycleState: 'pending_settlement',
      status: 'initiated',
    }),
  }
  const projection = buildTimelineProjectionFromLiquidity(
    {
      cashAvailableTotal: 1000,
      cashAvailablePlaid: 1000,
      cashAvailableManual: 0,
      income: {
        allIncome: [], expectedIncome: [], receivedIncome: [], missedIncome: [],
        cancelledIncome: [], projectedIncome: [], totalProjectedIncome: 0,
      },
      lifecyclePayments: [pendingSettlement],
    },
    { today: '2026-07-21', horizonDays: 45 }
  )

  assert.equal(paymentRequiresUserAction(pendingSettlement), false)
  assert.equal(paymentCountsAsUnpaidRisk(pendingSettlement), false)
  assert.equal(projection.adjustedRiskTotal, 0)
  assert.equal(projection.openObligationTotal, 0)
  assert.equal(projection.inTransitPaymentTotal, 300)
  assert.equal(projection.sections.inTransit[0]?.availableAction, 'Esperar confirmación bancaria')
})

test('pending settlement remains eligible for later Plaid reconciliation', () => {
  const result = buildReconciliationMatches({
    transactions: [{
      source: 'plaid_imports', id: 'plaid-payment', name: 'SYNCHRONY CREDIT CARD PAYMENT',
      amount: 125, date: '2026-07-21', institutionName: 'Synchrony',
      accountName: 'Credit Card',
    }],
    payments: [{
      id: 'obligation-instance', name: 'Synchrony', amount: 125,
      status: 'initiated', effective_due_date: '2026-07-21',
      updated_at: '2026-07-21T12:00:00Z', recurrence: 'monthly',
    }],
  })

  const selected = selectAutomaticReconciliations(result.allMatches)
  assert.equal(selected.length, 1)
  assert.equal(selected[0].paymentInstanceId, 'obligation-instance')
})

test('a truly unpaid past-due obligation still produces the expected warning', () => {
  const snapshot = overdueSnapshot()
  const decisions = buildMansorDecisionsV1FromSnapshot(snapshot)

  assert.equal(paymentRequiresUserAction(snapshot.lifecyclePayments[0]), true)
  assert.equal(paymentCountsAsUnpaidRisk(snapshot.lifecyclePayments[0]), true)
  assert.equal(decisions.some((decision) => decision.type === 'pay_now'), true)
})
