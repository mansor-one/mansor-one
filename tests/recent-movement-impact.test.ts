import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyRecentMovementImpact } from '../lib/financial-engine/recent-movement-impact.ts'
import type { LedgerSummaryTransaction } from '../lib/financial-engine/ledger-summary.ts'
import { classifyDebtReductionCredit } from '../lib/financial-engine/debt-reduction-credit.ts'

function movement(overrides: Partial<LedgerSummaryTransaction> = {}): LedgerSummaryTransaction {
  return {
    id: '1', sourceTable: 'quick_entries', date: '2026-07-20',
    description: 'Example', amount: 100, category: null, imported: null,
    source: 'plaid', plaidTransactionId: 'plaid-1', metadata: {}, ...overrides,
  }
}

test('uses canonical categories and transaction types instead of polarity', () => {
  assert.equal(classifyRecentMovementImpact(movement({ amount: -500, category: 'Restaurants' })).impact, 'expense')
  assert.equal(classifyRecentMovementImpact(movement({ amount: 500, category: 'Salary' })).impact, 'income')
  assert.equal(classifyRecentMovementImpact(movement({ category: 'Internal Transfer' })).impact, 'internal_transfer')
})

test('a reconciliation link is authoritative debt reduction', () => {
  const impact = classifyRecentMovementImpact(movement(), { status: 'reconciled', obligationName: 'Honda Soraya' })
  assert.equal(impact.impact, 'debt_reduction')
  assert.equal(impact.contextText, 'Reconciled Honda Soraya')
})

test('PAYYOURSELFBACK CREDIT is a statement credit without invented bank-payment meaning', () => {
  const impact = classifyRecentMovementImpact(movement({
    description: 'PAYYOURSELFBACK CREDIT',
    amount: -241.01,
    category: 'Credit Card Payment',
    metadata: { institutionName: 'Chase', accountType: 'credit', entryType: 'income' },
  }))
  assert.equal(impact.impact, 'refund_or_statement_credit')
  assert.equal(impact.contextText, 'Reduced the Chase balance')
  assert.equal(impact.reason.includes('debt payment'), false)
})

test('rewards and cashback applied to a card are statement credits, not income', () => {
  for (const description of ['REWARDS REDEMPTION', 'CASHBACK STATEMENT CREDIT']) {
    const impact = classifyRecentMovementImpact(movement({
      description,
      amount: -50,
      metadata: { institutionName: 'Chase', accountType: 'credit' },
    }))
    assert.equal(impact.impact, 'refund_or_statement_credit')
  }
})

test('debt-reduction credits require bank-credit semantics and are not inferred from polarity', () => {
  assert.equal(classifyDebtReductionCredit({
    description: 'PAYYOURSELFBACK CREDIT', amount: -241.01,
    accountType: 'credit', accountSubtype: 'credit card',
  })?.kind, 'pay_yourself_back')
  assert.equal(classifyDebtReductionCredit({
    description: 'CASHBACK', amount: -50, accountType: 'depository',
  }), null)
  assert.equal(classifyDebtReductionCredit({
    description: 'STATEMENT CREDIT', amount: 50, accountType: 'credit',
  }), null)
})

test('pending lifecycle evidence wins over confirmed-looking categories', () => {
  const impact = classifyRecentMovementImpact(movement({ category: 'Restaurants', metadata: { plaidPending: true } }))
  assert.equal(impact.impact, 'pending')
})

test('unknown remains neutral when authoritative evidence is absent', () => {
  assert.equal(classifyRecentMovementImpact(movement()).impact, 'unknown')
})
