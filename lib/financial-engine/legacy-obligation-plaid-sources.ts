import { chunkValues } from '../batching.ts'

export const LEGACY_PLAID_SOURCE_BATCH_SIZE = 50

export type LegacyPlaidSource = {
  plaid_transaction_id: string | null
  merchant: string | null
  amount: number | string | null
  institution_name: string | null
  plaid_account_id: string | null
  account_type: string | null
  account_subtype: string | null
  suggested_category: string | null
  plaid_category: string | null
}

type LegacyPlaidSourceBatchResult = {
  data: LegacyPlaidSource[] | null
  error: unknown
}

export async function loadLegacyPlaidSources({
  plaidTransactionIds,
  householdId,
  loadBatch,
}: {
  plaidTransactionIds: string[]
  householdId: string
  loadBatch: (
    ids: string[],
    householdId: string
  ) => PromiseLike<LegacyPlaidSourceBatchResult>
}) {
  const uniqueIds = [...new Set(plaidTransactionIds)]
  const batches = chunkValues(uniqueIds, LEGACY_PLAID_SOURCE_BATCH_SIZE)
  const results = await Promise.all(
    batches.map((ids) => loadBatch(ids, householdId))
  )

  for (const result of results) {
    if (result.error) throw result.error
  }

  return results.flatMap((result) => result.data || [])
}
