import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReconciliationMatches } from '../lib/financial-engine/reconciliation.ts'
import { selectAutomaticReconciliations } from '../lib/financial-engine/obligation-reconciliation-engine.ts'
import { businessDaysBetween, resolveTrustedPayments } from '../lib/financial-engine/payment-truth.ts'

function reconciliation(transactions = [{
  source: 'plaid_imports' as const,
  id: 'txn-1',
  name: 'SYNCHRONY CREDIT CARD PAYMENT',
  amount: 125,
  date: '2026-07-20',
  institutionName: 'Synchrony',
  accountName: 'Credit Card',
}]) {
  return buildReconciliationMatches({
    transactions,
    payments: [{
      id: 'obligation-1', name: 'Synchrony', amount: 125, status: 'initiated',
      effective_due_date: '2026-07-20', updated_at: '2026-07-17', recurrence: 'monthly',
    }],
  })
}

test('automatically reconciles one unique high-confidence posted transaction', () => {
  const result = reconciliation()
  const selected = selectAutomaticReconciliations(result.allMatches)
  assert.equal(selected.length, 1)
  assert.equal(selected[0].paymentInstanceId, 'obligation-1')
  assert.ok(selected[0].confidence >= 90)
})

test('manual confirmation is pending settlement and excluded from projected risk', () => {
  const [payment] = resolveTrustedPayments({
    today: '2026-07-20',
    payments: [{
      id: 'obligation:1', name: 'Honda', amount: 947.78, status: 'initiated',
      due_date: '2026-07-20', updated_at: '2026-07-20T12:00:00Z',
      lifecycleState: 'pending_settlement', source: 'obligation',
    }],
  })
  assert.equal(payment.truthStatus, 'in_transit')
  assert.equal(payment.actionable, false)
})

test('weekend days do not expire the three-business-day settlement window', () => {
  assert.equal(businessDaysBetween('2026-07-17', '2026-07-20'), 1)
  const [payment] = resolveTrustedPayments({
    today: '2026-07-20',
    payments: [{ id: '1', name: 'Honda', amount: 947.78, status: 'initiated', due_date: '2026-07-18', updated_at: '2026-07-17T12:00:00Z' }],
  })
  assert.equal(payment.truthStatus, 'in_transit')
})

test('does not auto-reconcile an ambiguous transaction against duplicate obligations', () => {
  const transaction = { source: 'plaid_imports' as const, id: 'txn-1', name: 'SYNCHRONY CREDIT CARD PAYMENT', amount: 125, date: '2026-07-20', institutionName: 'Synchrony', accountName: 'Credit Card' }
  const result = buildReconciliationMatches({
    transactions: [transaction],
    payments: [
      { id: 'a', name: 'Synchrony', amount: 125, status: 'initiated', effective_due_date: '2026-07-20', recurrence: 'monthly' },
      { id: 'b', name: 'Synchrony', amount: 125, status: 'initiated', effective_due_date: '2026-07-20', recurrence: 'monthly' },
    ],
  })
  assert.equal(selectAutomaticReconciliations(result.allMatches).length, 0)
})

test('amount-only or merchant-incompatible evidence never auto-closes an obligation', () => {
  const result = reconciliation([{ source: 'plaid_imports', id: 'txn-false', name: 'UNRELATED POS PURCHASE', amount: 125, date: '2026-07-20' }])
  assert.equal(selectAutomaticReconciliations(result.allMatches).length, 0)
  assert.ok(result.allMatches[0].confidence < 50)
})
