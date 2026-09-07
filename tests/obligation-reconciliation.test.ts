import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReconciliationMatches } from '../lib/financial-engine/reconciliation.ts'
import { selectAutomaticReconciliations } from '../lib/financial-engine/obligation-reconciliation-engine.ts'
import { businessDaysBetween, resolveTrustedPayments } from '../lib/financial-engine/payment-truth.ts'
import { obligationEvidenceCoverage } from '../lib/financial-engine/debt-reduction-credit.ts'

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

test('$359 U.S. Bank obligation keeps a different amount manual and never auto-reconciles it', () => {
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
  assert.equal(match.amountBehavior, 'fixed')
  assert.equal(match.requiresManualConfirmation, true)
  assert.match(match.reasons.join(' '), /fixed obligation.*manual confirmation/i)
  assert.equal(selectAutomaticReconciliations(result.allMatches).length, 0)
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

test('fixed nearby amounts remain manual despite otherwise strong evidence', () => {
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

  assert.equal(result.allMatches[0].requiresManualConfirmation, true)
  assert.equal(result.allMatches[0].amountBehavior, 'fixed')
  assert.equal(selectAutomaticReconciliations(result.allMatches).length, 0)
})

test('fixed exact amount is a very strong amount signal', () => {
  const [match] = buildReconciliationMatches({
    transactions: [{ source: 'plaid_imports', id: 'aaa-exact', name: 'AAA MOVIL', amount: 29.88, date: '2026-08-22', institutionName: 'FirstBank', accountName: 'Cuenta Perfecta', category: 'RENT_AND_UTILITIES' }],
    payments: [{ id: 'water', name: 'Agua', providerName: 'AAA', amount: 29.88, amountIsEstimated: false, status: 'pending', effective_due_date: '2026-08-22', recurrence: 'monthly', obligationType: 'utility', categoryCode: 'utilities_water' }],
  }).allMatches
  assert.equal(match.amountBehavior, 'fixed')
  assert.equal(match.requiresManualConfirmation, false)
  assert.equal(match.scoreFactors.find((factor) => factor.code === 'amount_exact')?.score, 25)
  assert.ok(match.reasons.some((reason) => /fixed expected amount/i.test(reason)))
})

test('fixed different amount remains visible but requires explicit confirmation', () => {
  const [match] = buildReconciliationMatches({
    transactions: [{ source: 'plaid_imports', id: 'aaa-40', name: 'AAA MOVIL', amount: 40, date: '2026-08-22', institutionName: 'FirstBank', accountName: 'Cuenta Perfecta', category: 'RENT_AND_UTILITIES' }],
    payments: [{ id: 'water', name: 'Agua', providerName: 'AAA', amount: 29.88, amountIsEstimated: false, status: 'pending', effective_due_date: '2026-08-22', recurrence: 'monthly', obligationType: 'utility', categoryCode: 'utilities_water' }],
  }).allMatches
  assert.equal(match.eligible, true)
  assert.equal(match.amountDifference, 10.12)
  assert.equal(match.requiresManualConfirmation, true)
  assert.ok(match.reasons.some((reason) => /fixed obligation.*manual confirmation/i.test(reason)))
  assert.equal(selectAutomaticReconciliations([match]).length, 0)
})

test('estimated exact and nearby amounts retain graduated signals', () => {
  const matches = buildReconciliationMatches({
    transactions: [
      { source: 'plaid_imports', id: 'exact', name: 'UTILITY CO', amount: 100, date: '2026-08-22' },
      { source: 'plaid_imports', id: 'near', name: 'UTILITY CO', amount: 100.5, date: '2026-08-22' },
    ],
    payments: [{ id: 'estimated-utility', name: 'Utility Co', amount: 100, amountIsEstimated: true, status: 'pending', effective_due_date: '2026-08-22', recurrence: 'monthly', obligationType: 'utility' }],
  }).allMatches
  const exact = matches.find((match) => match.transactionId === 'exact')
  const near = matches.find((match) => match.transactionId === 'near')
  assert.equal(exact?.amountBehavior, 'estimated')
  assert.equal(exact?.requiresManualConfirmation, false)
  assert.equal(exact?.scoreFactors.find((factor) => factor.code === 'amount_exact')?.score, 15)
  assert.equal(near?.amountBehavior, 'estimated')
  assert.equal(near?.requiresManualConfirmation, true)
  assert.equal(near?.scoreFactors.find((factor) => factor.code === 'amount_close')?.score, 10)
  assert.equal(selectAutomaticReconciliations(matches).some((match) => match.transactionId === 'near'), false)
})

test('provider and configured habitual account contribute structured reasons', () => {
  const [match] = buildReconciliationMatches({
    transactions: [{ source: 'plaid_imports', id: 'aaa', name: 'AAA MOVIL', amount: 29.88, date: '2026-08-22', institutionName: 'FirstBank', accountName: 'Cuenta Perfecta' }],
    payments: [{ id: 'water', name: 'Agua', providerName: 'AAA', amount: 29.88, amountIsEstimated: false, status: 'pending', effective_due_date: '2026-08-22', fundingAccountName: 'Cuenta Perfecta', recurrence: 'monthly' }],
  }).allMatches
  assert.ok(match.scoreFactors.some((factor) => factor.code === 'provider_match' && factor.passed))
  assert.ok(match.reasons.some((reason) => /obligation provider: AAA/i.test(reason)))
  assert.ok(match.scoreFactors.some((factor) => factor.code === 'funding_account_match' && factor.passed))
  assert.ok(match.reasons.some((reason) => /reported funding account/i.test(reason)))
})

test('Chase Pay Yourself Back credit is eligible as partial debt-reduction evidence', () => {
  const result = buildReconciliationMatches({
    transactions: [{
      source: 'plaid_imports', id: 'chase-credit-241',
      name: 'PAYYOURSELFBACK CREDIT', amount: -241.01,
      date: '2026-07-20', institutionName: 'Chase',
      accountName: 'Chase CREDIT CARD', accountType: 'credit',
      accountSubtype: 'credit card', category: 'GENERAL_MERCHANDISE',
    }],
    payments: [{
      id: 'chase-cycle', name: 'Chase', amount: 361,
      status: 'pending', effective_due_date: '2026-07-20',
      recurrence: 'monthly',
    }],
  })

  const [match] = result.allMatches
  assert.equal(match.eligible, true)
  assert.equal(match.evidenceKind, 'debt_reduction_credit')
  assert.equal(match.satisfiesAmount, 'partial')
  assert.ok(match.confidence >= 50)
  assert.equal(result.possibleMatches.length + result.likelyMatches.length + result.highConfidenceMatches.length, 1)
  assert.equal(selectAutomaticReconciliations(result.allMatches).length, 0)
})

test('reward and cashback credits require a credit account and credit direction', () => {
  const result = buildReconciliationMatches({
    transactions: [
      {
        source: 'plaid_imports', id: 'reward-card', name: 'REWARDS REDEMPTION',
        amount: -361, date: '2026-07-20', institutionName: 'Chase',
        accountName: 'Credit Card', accountType: 'credit',
      },
      {
        source: 'plaid_imports', id: 'cashback-checking', name: 'CASHBACK',
        amount: -361, date: '2026-07-20', institutionName: 'Chase',
        accountName: 'Checking', accountType: 'depository',
      },
    ],
    payments: [{
      id: 'chase-cycle', name: 'Chase', amount: 361,
      status: 'pending', effective_due_date: '2026-07-20', recurrence: 'monthly',
    }],
  })

  const reward = result.allMatches.find((match) => match.transactionId === 'reward-card')
  const checking = result.allMatches.find((match) => match.transactionId === 'cashback-checking')
  assert.equal(reward?.evidenceKind, 'debt_reduction_credit')
  assert.equal(reward?.satisfiesAmount, 'full')
  assert.equal(checking?.evidenceKind, 'payment')
  assert.equal(checking?.eligible, false)
})

test('partial credits stay open until cumulative reconciled evidence covers the obligation', () => {
  assert.deepEqual(obligationEvidenceCoverage(361, [-241.01]), {
    totalEvidenceAmount: 241.01,
    reconciledAmount: 241.01,
    obligationSatisfied: false,
    excessUnallocated: 0,
  })
  assert.deepEqual(obligationEvidenceCoverage(361, [-241.01, -119.99]), {
    totalEvidenceAmount: 361,
    reconciledAmount: 361,
    obligationSatisfied: true,
    excessUnallocated: 0,
  })
})

test('$241.01 Chase credit covers a $40 obligation without allocating its excess', () => {
  assert.deepEqual(obligationEvidenceCoverage(40, [-241.01]), {
    totalEvidenceAmount: 241.01,
    reconciledAmount: 40,
    obligationSatisfied: true,
    excessUnallocated: 201.01,
  })
})
