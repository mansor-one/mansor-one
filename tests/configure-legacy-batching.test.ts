import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  LEGACY_PLAID_SOURCE_BATCH_SIZE,
  loadLegacyPlaidSources,
  type LegacyPlaidSource,
} from '../lib/financial-engine/legacy-obligation-plaid-sources.ts'
import { rankLegacyObligationCandidates } from '../lib/financial-engine/legacy-obligation-candidates.ts'

function source(plaidTransactionId: string): LegacyPlaidSource {
  return {
    plaid_transaction_id: plaidTransactionId,
    merchant: plaidTransactionId === 'aaa-water' ? 'AAA MOVIL' : plaidTransactionId,
    amount: plaidTransactionId === 'aaa-water' ? 40 : 1,
    institution_name: 'FirstBank',
    plaid_account_id: 'account-1',
    account_type: 'depository',
    account_subtype: 'checking',
    suggested_category: 'utilities_water',
    plaid_category: 'RENT_AND_UTILITIES',
  }
}

test('configure-legacy Plaid sources are deduplicated and loaded in household-scoped batches of 50', async () => {
  const uniqueIds = [
    'aaa-water',
    ...Array.from({ length: 406 }, (_, index) => `plaid-${index}`),
  ]
  const requestedBatches: Array<{ ids: string[]; householdId: string }> = []
  const rows = await loadLegacyPlaidSources({
    plaidTransactionIds: [...uniqueIds, 'plaid-4', 'aaa-water'],
    householdId: 'household-water',
    loadBatch: async (ids, householdId) => {
      requestedBatches.push({ ids, householdId })
      return { data: ids.map(source), error: null }
    },
  })

  assert.equal(LEGACY_PLAID_SOURCE_BATCH_SIZE, 50)
  assert.ok(requestedBatches.length > 8)
  assert.ok(requestedBatches.every((batch) => batch.ids.length <= 50))
  assert.ok(
    requestedBatches.every(
      (batch) => batch.householdId === 'household-water'
    )
  )
  assert.deepEqual(
    rows.map((row) => row.plaid_transaction_id),
    uniqueIds
  )

  const aguaSource = rows.find(
    (row) => row.plaid_transaction_id === 'aaa-water'
  )
  assert.ok(aguaSource)
  const [rankedAgua] = rankLegacyObligationCandidates({
    candidates: [{
      id: 'quick-entry-water',
      entry_date: '2026-08-03',
      description: aguaSource.merchant || '',
      amount: Number(aguaSource.amount),
      account_name: 'Cuenta Perfecta',
      exactAmount: false,
      source: 'quick_entries',
      plaid_transaction_id: aguaSource.plaid_transaction_id,
      institution_name: aguaSource.institution_name,
      account_type: aguaSource.account_type,
      account_subtype: aguaSource.account_subtype,
      plaid_account_id: aguaSource.plaid_account_id,
      category:
        aguaSource.suggested_category || aguaSource.plaid_category,
    }],
    paymentName: 'Agua',
    expectedAmount: 29.88,
    expectedDate: '2026-06-22',
    amountIsEstimated: false,
    providerName: 'AAA',
    obligationType: 'utility',
    categoryCode: 'utilities_water',
    fundingAccountName: 'Cuenta Perfecta',
  })
  assert.equal(rankedAgua.description, 'AAA MOVIL')
  assert.equal(rankedAgua.contextualMatch, true)
  assert.equal(rankedAgua.requiresManualConfirmation, true)
})

test('configure-legacy Plaid source loading fails completely when any batch fails', async () => {
  const expectedError = new Error('batch failed')
  let batchNumber = 0

  await assert.rejects(
    loadLegacyPlaidSources({
      plaidTransactionIds: Array.from(
        { length: 401 },
        (_, index) => `plaid-${index}`
      ),
      householdId: 'household-water',
      loadBatch: async (ids) => {
        batchNumber += 1
        return batchNumber === 5
          ? { data: ids.slice(0, 1).map(source), error: expectedError }
          : { data: ids.map(source), error: null }
      },
    }),
    expectedError
  )
})

test('configure-legacy has no unbounded transaction-id in filter', () => {
  const route = readFileSync(
    new URL('../app/api/obligations/configure-legacy/route.ts', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(
    route,
    /\.in\('plaid_transaction_id',\s*plaidTransactionIds\)/
  )
  assert.match(route, /\.in\('plaid_transaction_id',\s*ids\)/)
  assert.equal((route.match(/\.in\(/g) || []).length, 1)
})
