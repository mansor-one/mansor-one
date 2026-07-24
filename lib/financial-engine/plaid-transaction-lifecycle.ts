export const EXCLUDED_SPENDING_TRANSACTION_STATUSES = [
  'pending',
  'superseded',
  'replaced',
  'removed',
  'rejected',
  'duplicate',
] as const

export type PlaidTransactionLifecycleStatus =
  | 'active'
  | (typeof EXCLUDED_SPENDING_TRANSACTION_STATUSES)[number]

export type PlaidLifecycleTransaction = {
  transactionId: string
  pendingTransactionId: string | null
  pending: boolean
  accountId: string | null
  merchant: string
  amount: number
  date: string
  status?: PlaidTransactionLifecycleStatus
}

export type PlaidRemovedTransaction = {
  transactionId: string
  accountId: string | null
}

export type PlaidLifecycleAction = {
  transactionId: string
  status: PlaidTransactionLifecycleStatus
  supersededByTransactionId: string | null
}

export function lifecycleActionsForSync({
  addedOrModified,
  removed,
}: {
  addedOrModified: PlaidLifecycleTransaction[]
  removed: PlaidRemovedTransaction[]
}) {
  const actions = new Map<string, PlaidLifecycleAction>()

  addedOrModified.forEach((transaction) => {
    actions.set(transaction.transactionId, {
      transactionId: transaction.transactionId,
      status: transaction.pending ? 'pending' : 'active',
      supersededByTransactionId: null,
    })

    if (!transaction.pending && transaction.pendingTransactionId) {
      actions.set(transaction.pendingTransactionId, {
        transactionId: transaction.pendingTransactionId,
        status: 'superseded',
        supersededByTransactionId: transaction.transactionId,
      })
    }
  })

  removed.forEach((transaction) => {
    const existing = actions.get(transaction.transactionId)
    if (existing?.status === 'superseded') return
    actions.set(transaction.transactionId, {
      transactionId: transaction.transactionId,
      status: 'removed',
      supersededByTransactionId: null,
    })
  })

  return Array.from(actions.values())
}

export function transactionStatusCountsTowardSpending(
  status: string | null | undefined,
  pending = false
) {
  if (pending) return false
  return !EXCLUDED_SPENDING_TRANSACTION_STATUSES.includes(
    String(status || 'active') as (typeof EXCLUDED_SPENDING_TRANSACTION_STATUSES)[number]
  )
}

function normalizeMerchant(value: string | null | undefined) {
  return String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\bLLC\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function dateDifferenceDays(left: string, right: string) {
  return Math.round(Math.abs(
    new Date(`${left}T00:00:00`).getTime() - new Date(`${right}T00:00:00`).getTime()
  ) / 86_400_000)
}

export function possiblePostedDuplicateGroups(
  transactions: PlaidLifecycleTransaction[]
) {
  const activePosted = transactions.filter(
    (transaction) => !transaction.pending && transactionStatusCountsTowardSpending(transaction.status)
  )
  const groups: PlaidLifecycleTransaction[][] = []
  const used = new Set<string>()

  activePosted.forEach((transaction, index) => {
    if (used.has(transaction.transactionId)) return
    const matches = activePosted.slice(index + 1).filter((candidate) =>
      candidate.accountId === transaction.accountId &&
      Math.round(Math.abs(candidate.amount) * 100) === Math.round(Math.abs(transaction.amount) * 100) &&
      normalizeMerchant(candidate.merchant) === normalizeMerchant(transaction.merchant) &&
      dateDifferenceDays(candidate.date, transaction.date) <= 3 &&
      candidate.pendingTransactionId !== transaction.transactionId &&
      transaction.pendingTransactionId !== candidate.transactionId
    )
    if (!matches.length) return
    const group = [transaction, ...matches]
    group.forEach((item) => used.add(item.transactionId))
    groups.push(group)
  })

  return groups
}
