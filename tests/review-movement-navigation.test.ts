import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { reviewQueueDrilldown } from '../lib/financial-engine/dashboard-drilldowns.ts'

const canonicalRoute = readFileSync(new URL('../app/robototina/review/page.tsx', import.meta.url), 'utf8')
const legacyRoute = readFileSync(new URL('../app/lab/review-queue/page.tsx', import.meta.url), 'utf8')

test('review movement uses the canonical relative review route', () => {
  const destination = reviewQueueDrilldown('toReview')

  assert.equal(destination, '/robototina/review?tab=toReview#queue')
  assert.equal(destination.startsWith('/'), true)
  assert.equal(destination.includes('localhost'), false)
  assert.match(destination, /[?&]tab=toReview(?:&|#)/)
  assert.match(destination, /#queue$/)
})

test('canonical and temporary legacy App Router routes share one implementation', () => {
  assert.match(canonicalRoute, /ReviewQueuePage/)
  assert.match(legacyRoute, /ReviewQueuePage/)
  assert.match(canonicalRoute, /@\/app\/components\/ReviewQueuePage/)
  assert.match(legacyRoute, /@\/app\/components\/ReviewQueuePage/)
})
