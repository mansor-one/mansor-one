import assert from 'node:assert/strict'
import { test } from 'node:test'
import { businessDaysBetween, generateExpectedIncomeInstances, resolveTrustedPayments, threePaycheckMonths } from '../lib/financial-engine/payment-truth.ts'
import { buildTimelineProjectionFromLiquidity } from '../lib/financial-engine/timeline.ts'

const today = '2026-07-19'

test('status logic separates zero, grace, overdue, future, paid, and possible matches', () => {
  const rows = resolveTrustedPayments({ today, payments: [
    { id: 'zero', name: 'Chase', amount: 0, due_date: '2026-07-20', status: 'pending' },
    { id: 'grace', name: 'Honda', amount: 900, due_date: '2026-07-18', grace_until: '2026-07-21', status: 'pending' },
    { id: 'late', name: 'Old bill', amount: 50, due_date: '2026-07-01', grace_until: '2026-07-05', status: 'pending' },
    { id: 'future', name: 'Insurance 2027', amount: 1000, due_date: '2027-08-01', status: 'pending' },
    { id: 'paid', name: 'Paid bill', amount: 20, due_date: '2026-07-20', status: 'paid' },
    { id: 'possible', name: 'Synchrony', amount: 361, due_date: '2026-07-22', status: 'pending', lifecycleMatchedTransaction: { id: 'tx', source: 'plaid_imports', name: 'Synchrony', amount: 361, date: '2026-07-20', confidence: 90, confidenceLevel: 'high' } },
  ] })
  assert.deepEqual(Object.fromEntries(rows.map((row) => [row.id, row.truthStatus])), {
    zero: 'incomplete', grace: 'grace_period', late: 'overdue', future: 'future', paid: 'paid', possible: 'possible_match',
  })
})

test('a confirmed ledger transaction cannot automatically match multiple payments', () => {
  const match = { id: 'same-tx', source: 'quick_entries', name: 'Utility', amount: 100, date: '2026-07-20', confidence: 95, confidenceLevel: 'high' }
  const rows = resolveTrustedPayments({ today, payments: [
    { id: 'a', name: 'Water', amount: 100, due_date: '2026-07-20', status: 'pending', lifecycleMatchedTransaction: match },
    { id: 'b', name: 'Power', amount: 100, due_date: '2026-07-21', status: 'pending', lifecycleMatchedTransaction: match },
  ] })
  assert.equal(rows.every((row) => row.truthStatus === 'possible_match'), true)
})

test('recent initiated payments are in transit for three business days', () => {
  assert.equal(businessDaysBetween('2026-07-17', '2026-07-19'), 0)
  assert.equal(businessDaysBetween('2026-07-16', '2026-07-21'), 3)

  const rows = resolveTrustedPayments({ today, payments: [
    { id: 'recent', name: 'Chase', amount: 947.78, due_date: '2026-07-18', status: 'initiated', updated_at: '2026-07-17T12:00:00Z' },
    { id: 'old', name: 'Old initiated', amount: 100, due_date: '2026-07-10', status: 'initiated', updated_at: '2026-07-10T12:00:00Z' },
  ] })

  assert.equal(rows[0].truthStatus, 'in_transit')
  assert.equal(rows[0].actionable, false)
  assert.equal(rows[1].truthStatus, 'overdue')
})

test('payments in transit reduce adjusted risk and are not subtracted twice', () => {
  const projection = buildTimelineProjectionFromLiquidity({
    cashAvailableTotal: 1000, cashAvailablePlaid: 1000, cashAvailableManual: 0,
    income: { allIncome: [], expectedIncome: [], receivedIncome: [], missedIncome: [], cancelledIncome: [], projectedIncome: [], totalProjectedIncome: 0 },
    lifecyclePayments: [
      { id: 'transit', name: 'Card payment', amount: 300, due_date: '2026-07-20', status: 'initiated', updated_at: '2026-07-17T12:00:00Z' },
      { id: 'open', name: 'Mortgage', amount: 500, due_date: '2026-07-20', status: 'pending' },
    ],
  }, { today, horizonDays: 45 })

  assert.equal(projection.openObligationTotal, 500)
  assert.equal(projection.inTransitPaymentTotal, 300)
  assert.equal(projection.adjustedRiskTotal, 500)
  assert.equal(projection.finalBalance, 500)
})

test('biweekly schedules generate occurrences and detect three-paycheck months', () => {
  const result = generateExpectedIncomeInstances({ start: '2026-07-01', end: '2026-07-31', schedules: [
    { id: 'manuel', name: 'Manuel pay', amount: 1000, next_expected_date: '2026-07-03', cadence: 'biweekly', owner_scope: 'manuel', is_active: true },
  ] })
  assert.deepEqual(result.instances.map((row) => row.date), ['2026-07-03', '2026-07-17', '2026-07-31'])
  assert.deepEqual(threePaycheckMonths(result.instances), [{ owner: 'manuel', month: '2026-07', count: 3 }])
})

test('legacy frequency participates in the 45-day horizon when cadence was stored as one-time', () => {
  const projection = buildTimelineProjectionFromLiquidity({
    cashAvailableTotal: 1000, cashAvailablePlaid: 1000, cashAvailableManual: 0,
    income: {
      allIncome: [{
        id: 'legacy-payroll', name: 'Nómina', amount: 1000,
        next_expected_date: '2026-07-02', cadence: 'one_time',
        frequency: 'biweekly_thursday', status: 'expected', is_active: true,
      }],
      expectedIncome: [], receivedIncome: [], missedIncome: [], cancelledIncome: [],
      projectedIncome: [], totalProjectedIncome: 0,
    },
    lifecyclePayments: [],
  }, { today: '2026-07-28', horizonDays: 45 })

  assert.deepEqual(
    projection.events.filter((event) => event.type === 'income').map((event) => event.date),
    ['2026-07-30', '2026-08-13', '2026-08-27', '2026-09-10']
  )
  assert.equal(projection.expectedIncomeTotal, 4000)
  assert.equal(projection.explanation.income.considered[0].cadence, 'biweekly')
})

test('zero-income projections explicitly distinguish no configuration from excluded schedules', () => {
  const none = buildTimelineProjectionFromLiquidity({
    cashAvailableTotal: 1000, cashAvailablePlaid: 1000, cashAvailableManual: 0,
    income: { allIncome: [], expectedIncome: [], receivedIncome: [], missedIncome: [], cancelledIncome: [], projectedIncome: [], totalProjectedIncome: 0 },
    lifecyclePayments: [],
  }, { today, horizonDays: 45 })
  assert.match(none.explanation.income.text, /No hay ingresos configurados/)

  const excluded = generateExpectedIncomeInstances({
    start: today,
    end: '2026-09-02',
    schedules: [{ id: 'missing', name: 'Ingreso sin monto', amount: null, next_expected_date: null, is_active: true }],
  })
  assert.equal(excluded.instances.length, 0)
  assert.match(excluded.excludedSchedules[0].reason, /importe positivo/)
})

test('projection excludes future, zero, paid, matched, duplicate, and possible-match payments', () => {
  const projection = buildTimelineProjectionFromLiquidity({
    cashAvailableTotal: 1000, cashAvailablePlaid: 1000, cashAvailableManual: 0,
    income: { allIncome: [{ id: 'income', name: 'Pay', amount: 500, next_expected_date: '2026-07-20', cadence: 'one_time', is_active: true }], expectedIncome: [], receivedIncome: [], missedIncome: [], cancelledIncome: [], projectedIncome: [], totalProjectedIncome: 0 },
    lifecyclePayments: [
      { id: 'open', name: 'Honda', amount: 200, due_date: '2026-07-20', status: 'pending' },
      { id: 'future', name: 'Insurance', amount: 900, due_date: '2027-08-01', status: 'pending' },
      { id: 'zero', name: 'Chase', amount: 0, due_date: '2026-07-20', status: 'pending' },
      { id: 'paid', name: 'Toyota', amount: 100, due_date: '2026-07-20', status: 'paid' },
    ],
  }, { today, horizonDays: 45 })
  assert.equal(projection.finalBalance, 1300)
  assert.equal(projection.diagnostics.futurePaymentsExcluded, 1)
  assert.equal(projection.paymentCounts.incomplete, 1)
  assert.equal(projection.paymentCounts.paid, 1)
})

test('duplicate monthly instances are excluded from projection', () => {
  const projection = buildTimelineProjectionFromLiquidity({
    cashAvailableTotal: 1000, cashAvailablePlaid: 1000, cashAvailableManual: 0,
    income: { allIncome: [], expectedIncome: [], receivedIncome: [], missedIncome: [], cancelledIncome: [], projectedIncome: [], totalProjectedIncome: 0 },
    lifecyclePayments: [
      { id: 'one', name: 'Mortgage', amount: 500, due_date: '2026-08-01', status: 'pending' },
      { id: 'two', name: 'Mortgage', amount: 500, due_date: '2026-08-01', status: 'pending' },
    ],
  }, { today, horizonDays: 45 })
  assert.equal(projection.finalBalance, 1000)
  assert.equal(projection.diagnostics.duplicateRecordsExcluded, 2)
})
