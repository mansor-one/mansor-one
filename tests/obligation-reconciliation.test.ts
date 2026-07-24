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
  const result = reconciliation([{ source: 'plaid_imports', id: 'txn-false', name: 'UNRELATED POS PURCHASE', amount: 125, date: '2026-07-20', institutionName: '', accountName: '' }])
  assert.equal(selectAutomaticReconciliations(result.allMatches).length, 0)
  assert.ok(result.allMatches[0].confidence < 50)
})

test('$359 U.S. Bank obligation rejects the unrelated $46 candidate', () => {
  const result = buildReconciliationMatches({
    transactions: [{
      source: 'plaid_imports', id: 'us-bank-46',
      name: 'Internet Payment Thank You', amount: 46, date: '2026-07-15',
      institutionName: 'U.S. Bank', accountName: 'Credit Card',
    }],
    payments: [{
      id: 'us-bank-cycle', name: 'U.S. Bank', amount: 359,
      status: 'initiated', effective_due_date: '2026-07-15',
      updated_at: '2026-07-13', recurrence: 'monthly',
    }],
  })

  const [match] = result.allMatches
  assert.equal(match.eligible, false)
  assert.equal(match.confidence, 0)
  assert.equal(
    result.highConfidenceMatches.length +
      result.likelyMatches.length +
      result.possibleMatches.length,
    0
  )
  assert.match(match.ineligibilityReasons.join(' '), /Exact amount is mandatory/)
})

test('$359 exact amount within the U.S. Bank grace window is eligible', () => {
  const result = buildReconciliationMatches({
    transactions: [{
      source: 'plaid_imports', id: 'us-bank-359', name: 'U.S. BANK PAYMENT',
      amount: 359, date: '2026-07-15', institutionName: 'U.S. Bank',
      accountName: 'Credit Card',
    }],
    payments: [{
      id: 'us-bank-cycle', name: 'U.S. Bank', amount: 359,
      status: 'initiated', effective_due_date: '2026-07-15',
      updated_at: '2026-07-13', recurrence: 'monthly',
    }],
  })

  const [match] = result.allMatches
  assert.equal(match.eligible, true)
  assert.equal(match.amountDifference <= 0.009, true)
  assert.equal(selectAutomaticReconciliations(result.allMatches).length, 1)
})

test('rejected obligation-transaction pair does not reappear', () => {
  const key = 'us-bank-cycle:plaid_imports:us-bank-359'
  const result = buildReconciliationMatches({
    transactions: [{
      source: 'plaid_imports', id: 'us-bank-359', name: 'U.S. BANK PAYMENT',
      amount: 359, date: '2026-07-15', institutionName: 'U.S. Bank',
      accountName: 'Credit Card',
    }],
    payments: [{
      id: 'us-bank-cycle', name: 'U.S. Bank', amount: 359,
      status: 'initiated', effective_due_date: '2026-07-15',
      updated_at: '2026-07-13', recurrence: 'monthly',
    }],
    rejectedMatchKeys: new Set([key]),
  })

  assert.equal(result.allMatches.length, 0)
})

test('near, partial, or split amounts stay ineligible without explicit semantics', () => {
  const result = buildReconciliationMatches({
    transactions: [{
      source: 'plaid_imports', id: 'partial', name: 'U.S. BANK PAYMENT',
      amount: 358.5, date: '2026-07-15', institutionName: 'U.S. Bank',
      accountName: 'Credit Card',
    }],
    payments: [{
      id: 'us-bank-cycle', name: 'U.S. Bank', amount: 359,
      status: 'initiated', effective_due_date: '2026-07-15',
      recurrence: 'monthly',
    }],
  })

  assert.equal(result.allMatches[0].eligible, false)
  assert.equal(selectAutomaticReconciliations(result.allMatches).length, 0)
})
