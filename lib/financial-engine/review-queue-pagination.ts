import type { ReviewQueueCandidate } from './review-queue'

export type ReviewQueueTab = 'toReview' | 'ready' | 'duplicates' | 'ath' | 'all'

export type ReviewQueueCounts = {
  toReview: number
  ready: number
  duplicates: number
  ath: number
  all: number
  visible: number
}

function isExactImportedDuplicate(candidate: ReviewQueueCandidate) {
  const match = candidate.duplicateContext?.bestDuplicateMatch
  return Boolean(match?.matchType === 'plaid_transaction_id' && match.confidence === 100)
}

function isPossibleDuplicate(candidate: ReviewQueueCandidate) {
  return Boolean(candidate.duplicateContext && !isExactImportedDuplicate(candidate))
}

function groupKey(candidate: ReviewQueueCandidate) {
  const duplicate = candidate.duplicateContext?.bestDuplicateMatch
  if (duplicate) {
    return [candidate.classification, duplicate.matchType, duplicate.confirmedLedgerEntry.id, duplicate.confidence === 100 ? 'exact' : 'possible'].join(':')
  }
  return [candidate.classification, candidate.transaction.plaidTransactionId || candidate.transaction.id].join(':')
}

export function paginateReviewQueue(input: {
  candidates: ReviewQueueCandidate[]
  readyToConfirm: ReviewQueueCandidate[]
  needsCategory: ReviewQueueCandidate[]
  possibleDuplicate: ReviewQueueCandidate[]
  athReview: ReviewQueueCandidate[]
  paymentConfirmation: ReviewQueueCandidate[]
  needsManualReview: ReviewQueueCandidate[]
  tab: ReviewQueueTab
  subset?: 'needs-category' | 'spending-excluded' | 'transaction'
  spendingPeriod?: string
  transactionId?: string
  query?: string
  category?: string
  page: number
  pageSize?: number
}) {
  const possibleDuplicates = input.possibleDuplicate.filter(isPossibleDuplicate)
  const toReview = [
    ...input.needsCategory,
    ...possibleDuplicates,
    ...input.athReview,
    ...input.paymentConfirmation,
    ...input.needsManualReview,
  ]
  const byTab: Record<ReviewQueueTab, ReviewQueueCandidate[]> = {
    toReview,
    ready: input.readyToConfirm,
    duplicates: input.possibleDuplicate,
    ath: input.athReview,
    all: input.candidates,
  }
  let selected = byTab[input.tab]
  if (input.subset === 'needs-category' && input.tab === 'toReview') selected = input.needsCategory
  if (input.subset === 'spending-excluded' && input.tab === 'all') {
    selected = input.candidates.filter((candidate) => Boolean(
      input.spendingPeriod &&
      candidate.transaction.date?.startsWith(input.spendingPeriod) &&
      candidate.transaction.metadata.pending !== true &&
      candidate.transaction.metadata.transactionStatus !== 'pending'
    ))
  }
  if (input.subset === 'transaction' && input.tab === 'all') {
    selected = input.candidates.filter((candidate) => candidate.transaction.id === input.transactionId)
  }

  // Filter the whole selected view before grouping/pagination, never just the
  // rows already delivered to the browser. Global dashboard counts stay intact.
  const query = input.query?.trim().toLocaleLowerCase() || ''
  const categoryQuery = input.category?.trim().toLocaleLowerCase() || ''
  selected = selected.filter((candidate) => {
    const category = candidate.canonicalCategory?.displayName || candidate.suggestedCategory || 'Needs category'
    const metadata = candidate.transaction.metadata
    const text = [candidate.merchant, candidate.transaction.description,
      metadata?.institutionName, metadata?.accountName, metadata?.accountMask,
      category, candidate.classification].filter(Boolean).join(' ').toLocaleLowerCase()
    return (!query || text.includes(query)) && (!categoryQuery || category.toLocaleLowerCase().includes(categoryQuery))
  })

  const grouped = new Map<string, ReviewQueueCandidate[]>()
  selected.forEach((candidate) => {
    const key = groupKey(candidate)
    grouped.set(key, [...(grouped.get(key) || []), candidate])
  })
  const groups = [...grouped.values()]
  const pageSize = Number.isFinite(input.pageSize)
    ? Math.min(25, Math.max(1, Math.floor(input.pageSize!)))
    : 25
  const pageCount = Math.max(1, Math.ceil(groups.length / pageSize))
  const page = Number.isFinite(input.page)
    ? Math.min(Math.max(1, Math.floor(input.page)), pageCount)
    : 1
  const pageGroups = groups.slice((page - 1) * pageSize, page * pageSize)
  const pageCandidates = pageGroups.flat()
  const pageIds = new Set(pageCandidates.map((candidate) => `${candidate.transaction.sourceTable}:${candidate.transaction.id}:${candidate.classification}`))
  const onPage = (candidate: ReviewQueueCandidate) => pageIds.has(`${candidate.transaction.sourceTable}:${candidate.transaction.id}:${candidate.classification}`)

  const counts: ReviewQueueCounts = {
    toReview: toReview.length,
    ready: input.readyToConfirm.length,
    duplicates: input.possibleDuplicate.length,
    ath: input.athReview.length,
    all: input.candidates.length,
    visible: input.candidates.filter((candidate) => !isExactImportedDuplicate(candidate)).length,
  }

  return {
    counts,
    page,
    pageCount,
    pageSize,
    totalGroups: groups.length,
    candidates: pageCandidates,
    readyToConfirm: input.readyToConfirm.filter(onPage),
    needsCategory: input.needsCategory.filter(onPage),
    possibleDuplicate: input.possibleDuplicate.filter(onPage),
    athReview: input.athReview.filter(onPage),
    paymentConfirmation: input.paymentConfirmation.filter(onPage),
    needsManualReview: input.needsManualReview.filter(onPage),
  }
}
