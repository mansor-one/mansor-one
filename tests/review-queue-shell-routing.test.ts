import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const shared = readFileSync(new URL('../app/components/ReviewQueuePage.tsx', import.meta.url), 'utf8')
const back = readFileSync(new URL('../app/components/ReviewQueueBackAction.tsx', import.meta.url), 'utf8')
const labRoute = readFileSync(new URL('../app/lab/review-queue/page.tsx', import.meta.url), 'utf8')
const productRoute = readFileSync(new URL('../app/robototina/review/page.tsx', import.meta.url), 'utf8')

test('Review Queue uses the standard application shell and product breadcrumb', () => {
  assert.match(shared, /<AppShell/)
  assert.match(shared, /<ReviewQueueBackAction/)
  assert.match(shared, /Robototina/)
  assert.match(shared, /Revisar transacciones/)
})

test('back action preserves browser history with a safe Robototina fallback', () => {
  assert.match(back, /const fallbackHref = '\/robototina'/)
  assert.match(back, /router\.back\(\)/)
  assert.match(back, /origin === window\.location\.origin/)
  assert.match(back, /href=\{fallbackHref\}/)
  assert.doesNotMatch(back, /setActiveTab|setQuery|setCategoryFilter/)
})

test('laboratory and product routes render one shared queue implementation', () => {
  assert.match(labRoute, /from '@\/app\/components\/ReviewQueuePage'/)
  assert.match(productRoute, /from '@\/app\/components\/ReviewQueuePage'/)
  assert.match(labRoute, /<ReviewQueuePage searchParams=\{searchParams\}/)
  assert.match(productRoute, /<ReviewQueuePage searchParams=\{searchParams\}/)
  assert.match(shared, /<ReviewQueueClient/)
  assert.equal((labRoute.match(/<ReviewQueueClient/g) || []).length, 0)
  assert.equal((productRoute.match(/<ReviewQueueClient/g) || []).length, 0)
})

test('shared implementation preserves queue search parameters and financial reads', () => {
  for (const field of ['tab', 'subset', 'year', 'month', 'transaction']) {
    assert.match(shared, new RegExp(`${field}\\?: string`))
  }
  assert.match(shared, /getReviewQueue\(supabase, user\.id\)/)
  assert.match(shared, /initialTab=\{initialTab\}/)
  assert.match(shared, /initialSubset=/)
})
