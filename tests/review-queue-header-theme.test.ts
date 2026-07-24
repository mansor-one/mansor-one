import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const client = readFileSync(new URL('../app/lab/review-queue/ReviewQueueClient.tsx', import.meta.url), 'utf8')

test('Review Queue metrics form one compact responsive five-card row', () => {
  assert.match(client, /sm:grid-cols-2 lg:grid-cols-5/)
  assert.match(client, /bg-\[#0d1b35\]/)
  assert.match(client, /card\.icon/)
  assert.match(client, /space-y-4/)
  assert.doesNotMatch(client, /md:grid-cols-3 gap-4/)
})

test('tabs and exports share an accessible compact toolbar', () => {
  assert.match(client, /role="group" aria-label="Queue views"/)
  assert.match(client, /aria-pressed=\{activeTab === tab\.id\}/)
  assert.match(client, /aria-label="Queue tools"/)
  assert.match(client, /Exportar cola/)
  assert.match(client, /Exportar duplicados/)
  assert.match(client, /focus-visible:outline-indigo-300/)
})

test('header layout covers mobile tablet and wide-screen breakpoints', () => {
  assert.match(client, /grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5/)
  assert.match(client, /flex-col gap-3 xl:flex-row/)
  assert.match(client, /max-w-full overflow-x-auto/)
  assert.match(client, /md:grid-cols-3/)
})
