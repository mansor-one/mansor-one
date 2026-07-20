import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateExpectedIncomeInstances, resolveTrustedPayments, threePaycheckMonths } from '../lib/financial-engine/payment-truth.ts'
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

test('biweekly schedules generate occurrences and detect three-paycheck months', () => {
  const result = generateExpectedIncomeInstances({ start: '2026-07-01', end: '2026-07-31', schedules: [
    { id: 'manuel', name: 'Manuel pay', amount: 1000, next_expected_date: '2026-07-03', cadence: 'biweekly', owner_scope: 'manuel', is_active: true },
  ] })
  assert.deepEqual(result.instances.map((row) => row.date), ['2026-07-03', '2026-07-17', '2026-07-31'])
  assert.deepEqual(threePaycheckMonths(result.instances), [{ owner: 'manuel', month: '2026-07', count: 3 }])
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
