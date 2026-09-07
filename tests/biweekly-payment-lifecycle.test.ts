import assert from 'node:assert/strict'
import test from 'node:test'
import { projectedCanonicalInstances } from '../lib/finance/paymentLifecycle.ts'
import { buildMonthlyReport } from '../lib/financial-engine/monthly-report.ts'
import { enumerateRecurringCycles } from '../lib/financial-engine/recurring-cycle-enumerator.ts'
import { buildReconciliationMatches } from '../lib/financial-engine/reconciliation.ts'
import { buildTimelineProjectionFromLiquidity } from '../lib/financial-engine/timeline.ts'
import type { PortfolioSummary } from '../lib/financial-engine/types.ts'

const schedule = {
  id: 'barber-schedule',
  name: 'Barbero',
  amount: 40,
  due_day: null,
  recurrence_type: 'biweekly',
  recurrence_interval: 1,
  is_active: true,
  custom_schedule_notes: 'source:legacy | anchor_date:2026-08-07',
}

function lifecyclePayments(startDate = '2026-08-01', horizonEnd = '2026-09-15') {
  return enumerateRecurringCycles({ source: schedule, startDate, horizonEnd }).map((cycle) => ({
    id: `scheduled:${schedule.id}:${cycle.dueDate}`,
    name: schedule.name,
    amount: schedule.amount,
    status: 'pending',
    due_date: cycle.dueDate,
    expected_date: cycle.dueDate,
    effective_due_date: cycle.dueDate,
    payment_month: cycle.month,
    payment_year: cycle.year,
    scheduled_payment_id: schedule.id,
    source: 'scheduled_payment' as const,
    lifecycleItemType: 'scheduled_payment' as const,
  }))
}

test('Payment Lifecycle occurrence contract uses every date and a date-based id', () => {
  const payments = lifecyclePayments()

  assert.deepEqual(payments.map((payment) => payment.expected_date), [
    '2026-08-07', '2026-08-21', '2026-09-04',
  ])
  assert.deepEqual(payments.map((payment) => payment.id), [
    'scheduled:barber-schedule:2026-08-07',
    'scheduled:barber-schedule:2026-08-21',
    'scheduled:barber-schedule:2026-09-04',
  ])
  assert.ok(payments.every((payment) => payment.status === 'pending'))
})

test('an existing biweekly instance suppresses only its own expected date', () => {
  const payments = enumerateRecurringCycles({
    source: schedule,
    startDate: '2026-08-01',
    horizonEnd: '2026-08-31',
    existingCycles: [{ dueDate: '2026-08-07' }],
  })

  assert.deepEqual(payments.map((payment) => payment.dueDate), ['2026-08-21'])
})

test('Timeline and cash-flow forecast retain both August biweekly commitments', () => {
  const payments = lifecyclePayments('2026-08-01', '2026-08-31')
  const timeline = buildTimelineProjectionFromLiquidity({
    cashAvailableTotal: 500,
    cashAvailablePlaid: 500,
    cashAvailableManual: 0,
    lifecyclePayments: payments,
    income: { allIncome: [] },
  } as never, { today: '2026-08-01', horizonDays: 30 })

  assert.deepEqual(timeline.events.filter((event) => event.type === 'payment').map((event) => event.date), [
    '2026-08-07', '2026-08-21',
  ])
  assert.equal(timeline.openObligationTotal, 80)
  assert.equal(timeline.finalBalance, 420)
})

test('monthly report keeps separate biweekly instances in the same month', () => {
  const portfolio = {
    totalLiquidAvailable: 500,
    totalLiabilities: 0,
    netWorth: 500,
    liquidAssets: [],
    liabilities: [],
  } as unknown as PortfolioSummary
  const report = buildMonthlyReport({
    month: '2026-08',
    now: new Date('2026-08-01T12:00:00-04:00'),
    transactions: [],
    obligations: [
      { id: 'barber:2026-08-07', name: 'Barbero', amount: 40, dueDate: '2026-08-07', status: 'pending' },
      { id: 'barber:2026-08-21', name: 'Barbero', amount: 40, dueDate: '2026-08-21', status: 'pending' },
    ],
    portfolio,
    pendingReviewCount: 0,
  })

  assert.deepEqual(report.obligations.upcoming.map((row) => row.id), [
    'barber:2026-08-07', 'barber:2026-08-21',
  ])
})

test('reconciliation targets the correct biweekly instance, not the month as a whole', () => {
  const result = buildReconciliationMatches({
    transactions: [{
      source: 'plaid_imports', id: 'barber-payment-aug-21', name: 'BARBERO',
      amount: 40, date: '2026-08-21', institutionName: 'FirstBank', accountName: 'Cuenta Perfecta',
    }],
    payments: [
      { id: 'barber:2026-08-07', name: 'Barbero', amount: 40, status: 'pending', effective_due_date: '2026-08-07', recurrence: 'biweekly' },
      { id: 'barber:2026-08-21', name: 'Barbero', amount: 40, status: 'pending', effective_due_date: '2026-08-21', recurrence: 'biweekly' },
    ],
  })

  assert.equal(result.allMatches[0].paymentInstanceId, 'barber:2026-08-21')
  assert.equal(result.allMatches[0].dateDifferenceDays, 0)
})

test('canonical biweekly projection uses the first full expected date as its anchor', () => {
  const profile = {
    id: 'barber-obligation', user_id: 'user', name: 'Barbero', description: null,
    category_code: 'personal_care', owner: 'household', obligation_type: 'service',
    default_amount: 40, amount_is_estimated: false, frequency: 'biweekly', due_day: null,
    grace_period_days: 0, payment_method: null, is_active: true, notes: null,
    created_at: null, updated_at: null, providers: [], currentProvider: null,
    instances: [{
      id: 'barber-anchor', user_id: 'user', obligation_id: 'barber-obligation',
      provider_id: null, expected_date: '2026-08-07', effective_due_date: '2026-08-07',
      amount_expected: 40, amount_is_estimated: false, status: 'pending', source: 'configured',
      notes: null, created_at: null, updated_at: null,
    }],
  }
  const projected = projectedCanonicalInstances({
    asOfDate: '2026-08-01', active: [profile], allInstances: [], upcoming: [],
    overdue: [], gracePeriod: [], estimated: [], completed: [],
  } as never, '2026-09-15')

  assert.deepEqual(projected.map((instance) => instance.expected_date), [
    '2026-08-21', '2026-09-04',
  ])
  assert.deepEqual(projected.map((instance) => instance.id), [
    'projected:barber-obligation:2026-08-21',
    'projected:barber-obligation:2026-09-04',
  ])
})
