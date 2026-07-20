import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  lifecycleActionsForSync,
  possiblePostedDuplicateGroups,
  transactionStatusCountsTowardSpending,
} from '../lib/financial-engine/plaid-transaction-lifecycle.ts'

test('posted transaction supersedes its linked pending transaction', () => {
  const actions = lifecycleActionsForSync({
    addedOrModified: [{
      transactionId: 'posted-1', pendingTransactionId: 'pending-1', pending: false,
      accountId: 'account', merchant: 'CAPRESE', amount: 17.11, date: '2026-07-08',
    }],
    removed: [{ transactionId: 'pending-1', accountId: 'account' }],
  })
  assert.deepEqual(actions, [
    { transactionId: 'posted-1', status: 'active', supersededByTransactionId: null },
    { transactionId: 'pending-1', status: 'superseded', supersededByTransactionId: 'posted-1' },
  ])
})

test('sync lifecycle actions are idempotent for the same source update', () => {
  const input = {
    addedOrModified: [{
      transactionId: 'posted', pendingTransactionId: 'pending', pending: false,
      accountId: 'account', merchant: 'Merchant', amount: 10, date: '2026-07-10',
    }],
    removed: [{ transactionId: 'pending', accountId: 'account' }],
  }
  assert.deepEqual(lifecycleActionsForSync(input), lifecycleActionsForSync(input))
  assert.equal(new Set(lifecycleActionsForSync(input).map((row) => row.transactionId)).size, 2)
})

test('confirmed spending excludes pending and inactive lifecycle states', () => {
  const rows = [
    { amount: 17.11, status: 'superseded', pending: true },
    { amount: 17.11, status: 'active', pending: false },
    { amount: 16.57, status: 'superseded', pending: false },
    { amount: 16.57, status: 'active', pending: false },
    { amount: 4.5, status: 'removed', pending: false },
    { amount: 4.5, status: 'active', pending: false },
  ]
  const total = rows
    .filter((row) => transactionStatusCountsTowardSpending(row.status, row.pending))
    .reduce((sum, row) => sum + row.amount, 0)
  assert.equal(total, 38.18)
})

test('unlinked similar posted transactions remain possible duplicates', () => {
  const groups = possiblePostedDuplicateGroups([
    { transactionId: 'one', pendingTransactionId: null, pending: false, accountId: 'chase', merchant: 'McDonald’s', amount: 16.57, date: '2026-07-08', status: 'active' },
    { transactionId: 'two', pendingTransactionId: null, pending: false, accountId: 'chase', merchant: "McDonald's", amount: 16.57, date: '2026-07-10', status: 'active' },
  ])
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].map((row) => row.transactionId), ['one', 'two'])
})
