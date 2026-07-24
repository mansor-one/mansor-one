import assert from 'node:assert/strict'
import test from 'node:test'
import {
  reviewQueueDrilldown,
  spendingDrilldown,
  timelineDrilldown,
} from '../lib/financial-engine/dashboard-drilldowns.ts'

test('monthly spending drill-down preserves confirmed period filters', () => {
  assert.equal(
    spendingDrilldown({ year: 2026, month: 7, view: 'confirmed-expenses' }),
    '/spending?year=2026&month=7&view=confirmed-expenses#dashboard-calculation'
  )
})

test('specific spending drill-down preserves encoded record filters', () => {
  const href = spendingDrilldown({
    year: 2026,
    month: 7,
    view: 'confirmed-expenses',
    merchant: "MCDONALD'S",
    amount: 16.57,
    date: '2026-07-10',
  })

  assert.match(href, /merchant=MCDONALD%27S/)
  assert.match(href, /amount=16.57/)
  assert.match(href, /date=2026-07-10/)
})

test('semi-monthly spending drill-down preserves both date boundaries', () => {
  assert.equal(
    spendingDrilldown({
      year: 2026,
      month: 7,
      view: 'confirmed-expenses',
      from: '2026-07-16',
      to: '2026-07-31',
    }),
    '/spending?year=2026&month=7&view=confirmed-expenses&from=2026-07-16&to=2026-07-31#dashboard-calculation'
  )
})

test('timeline and review queue links preserve dashboard datasets', () => {
  assert.equal(
    timelineDrilldown({ horizon: 45, view: 'actionable' }),
    '/timeline?horizon=45&view=actionable#dashboard-calculation'
  )
  assert.equal(
    reviewQueueDrilldown('ready'),
    '/lab/review-queue?tab=ready#queue'
  )
  assert.equal(
    reviewQueueDrilldown('toReview', 'needs-category'),
    '/lab/review-queue?tab=toReview&subset=needs-category#queue'
  )
})
