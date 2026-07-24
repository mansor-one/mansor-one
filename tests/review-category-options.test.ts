import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  getSystemCategories,
  getUniqueSystemCategoryOptions,
} from '../lib/financial-engine/categories.ts'

const card = readFileSync(new URL('../app/lab/review-queue/ActionableTransactionCard.tsx', import.meta.url), 'utf8')
const page = readFileSync(new URL('../app/components/ReviewQueuePage.tsx', import.meta.url), 'utf8')

test('Review Queue category option values and React keys are unique', () => {
  const options = getUniqueSystemCategoryOptions()
  const values = options.map((option) => option.value)

  assert.equal(new Set(values).size, values.length)
  assert.match(card, /key=\{item\.value\}/)
  assert.match(page, /getUniqueSystemCategoryOptions\(\)/)
})

test('duplicate canonical display names are merged without changing their label', () => {
  const duplicateLabels = getSystemCategories()
    .map((category) => category.displayName)
    .filter((label, index, labels) => labels.indexOf(label) !== index)
  const options = getUniqueSystemCategoryOptions()

  assert.deepEqual([...new Set(duplicateLabels)].sort(), [
    'Credit Card Payment',
    'Insurance',
    'Mortgage',
  ])
  for (const label of new Set(duplicateLabels)) {
    assert.equal(options.filter((option) => option.value === label).length, 1)
    assert.equal(options.find((option) => option.value === label)?.label, label)
  }
})
