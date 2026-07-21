import assert from 'node:assert/strict'
import test from 'node:test'
import {
  confirmedEntryType,
  decisionRequiresPlanningFund,
  isReviewTransactionType,
} from '../lib/financial-engine/review-transaction-decision.ts'

test('supports only the six user-facing transaction decisions', () => {
  for (const value of ['regular_expense', 'goal_event', 'debt_payment', 'transfer', 'non_spending', 'ignore']) {
    assert.equal(isReviewTransactionType(value), true)
  }
  assert.equal(isReviewTransactionType('ai_guess'), false)
})

test('goal event keeps expense treatment while requiring a real fund', () => {
  assert.equal(decisionRequiresPlanningFund('goal_event'), true)
  assert.equal(confirmedEntryType('goal_event'), 'expense')
  assert.equal(confirmedEntryType('regular_expense'), 'expense')
})

test('non-spending decisions map independently from canonical category', () => {
  assert.equal(confirmedEntryType('debt_payment'), 'payment')
  assert.equal(confirmedEntryType('transfer'), 'transfer')
  assert.equal(confirmedEntryType('non_spending'), 'non_spending')
  assert.equal(confirmedEntryType('ignore'), null)
})
