import assert from 'node:assert/strict'
import test from 'node:test'

import { selectAuthoritativeCardTerms } from '../lib/financial-engine/card-authority.ts'

test('Plaid liabilities outrank manual and recurring minimums', () => {
  const terms = selectAuthoritativeCardTerms({
    plaidMinimumPayment: 125,
    plaidDueDate: '2026-08-12',
    manualMinimumPayment: 359,
    scheduleMinimumPayment: 46,
  })

  assert.equal(terms.minimumPayment, 125)
  assert.equal(terms.minimumPaymentSource, 'Plaid Liabilities')
  assert.equal(terms.nextDueDate, '2026-08-12')
  assert.equal(terms.dueDateSource, 'Plaid Liabilities')
})

test('manual minimum wins over a conflicting recurring schedule without deleting either source', () => {
  const terms = selectAuthoritativeCardTerms({
    manualMinimumPayment: 359,
    manualName: 'US Bank',
    manualDueDay: 15,
    scheduleMinimumPayment: 46,
    scheduleName: 'US Bank',
    scheduleDueDay: 15,
  })

  assert.equal(terms.minimumPayment, 359)
  assert.equal(terms.minimumPaymentSource, 'Manual card: US Bank')
  assert.equal(terms.dueDay, 15)
  assert.equal(terms.dueDateSource, 'Recurring schedule: US Bank')
})

test('zero and missing minimums are not presented as an authoritative payment', () => {
  const terms = selectAuthoritativeCardTerms({
    plaidMinimumPayment: null,
    manualMinimumPayment: 0,
    scheduleMinimumPayment: 0,
    timelineMinimumPayment: null,
  })

  assert.equal(terms.minimumPayment, null)
  assert.equal(terms.minimumPaymentSource, null)
})

test('Timeline due date outranks Plaid while Plaid minimum remains authoritative', () => {
  const terms = selectAuthoritativeCardTerms({
    plaidMinimumPayment: 361,
    plaidDueDate: '2026-08-08',
    timelineDueDate: '2026-08-09',
  })

  assert.equal(terms.minimumPayment, 361)
  assert.equal(terms.nextDueDate, '2026-08-09')
  assert.equal(terms.dueDateSource, 'Linked Timeline obligation')
})
