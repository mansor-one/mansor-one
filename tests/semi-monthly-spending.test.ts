import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateSemiMonthlySpending,
  currentSemiMonthlyPeriod,
} from '../lib/financial-engine/semi-monthly-spending.ts'
import type { LedgerSummaryTransaction } from '../lib/financial-engine/ledger-summary.ts'

function transaction(
  id: string,
  date: string,
  amount: number,
  category: string,
  metadata: Record<string, unknown> = {}
): LedgerSummaryTransaction {
  return {
    id,
    sourceTable: 'quick_entries',
    date,
    description: id,
    amount,
    category,
    imported: null,
    source: 'manual',
    plaidTransactionId: null,
    metadata,
  }
}

const july23InPuertoRico = new Date('2026-07-23T16:00:00.000Z')

test('includes confirmed expenses on or after the 16th and excludes earlier expenses', () => {
  const result = calculateSemiMonthlySpending(
    [
      transaction('before', '2026-07-15', 10, 'Restaurants'),
      transaction('start', '2026-07-16', 20, 'Restaurants'),
      transaction('after', '2026-07-20', 30, 'School Supplies'),
    ],
    july23InPuertoRico
  )

  assert.deepEqual(result.period, {
    year: 2026,
    month: 7,
    startDate: '2026-07-16',
    endDate: '2026-07-31',
  })
  assert.equal(result.amount, 50)
  assert.deepEqual(result.included.map((item) => item.id), ['start', 'after'])
})

test('excludes transfers, income, pending lifecycle rows, and archived rows', () => {
  const result = calculateSemiMonthlySpending(
    [
      transaction('expense', '2026-07-17', 25, 'Restaurants'),
      transaction('transfer', '2026-07-18', 100, 'Internal Transfer'),
      transaction('income', '2026-07-19', 200, 'Salary'),
      transaction('pending', '2026-07-20', 30, 'Restaurants', {
        plaidPending: true,
        plaidTransactionStatus: 'pending',
      }),
      transaction('rejected-duplicate', '2026-07-21', 40, 'Restaurants', {
        plaidTransactionStatus: 'duplicate',
      }),
      transaction('archived', '2026-07-22', 50, 'Restaurants', {
        isArchived: true,
      }),
    ],
    july23InPuertoRico
  )

  assert.equal(result.amount, 25)
  assert.deepEqual(result.included.map((item) => item.id), ['expense'])
})

test('uses the household timezone at the semi-month boundary', () => {
  assert.deepEqual(
    currentSemiMonthlyPeriod(
      new Date('2026-07-16T03:59:59.999Z'),
      'America/Puerto_Rico'
    ),
    {
      year: 2026,
      month: 7,
      startDate: '2026-07-01',
      endDate: '2026-07-15',
    }
  )
  assert.deepEqual(
    currentSemiMonthlyPeriod(
      new Date('2026-07-16T04:00:00.000Z'),
      'America/Puerto_Rico'
    ),
    {
      year: 2026,
      month: 7,
      startDate: '2026-07-16',
      endDate: '2026-07-31',
    }
  )
})
