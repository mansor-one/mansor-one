import { chunkValues } from '../batching.ts'

export const TRANSACTION_CONTEXT_BATCH_SIZE = 100

export function transactionContextChunks<T>(values: T[], size = TRANSACTION_CONTEXT_BATCH_SIZE) {
  return chunkValues(values, size)
}
