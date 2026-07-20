import type { FinancialSupabaseClient } from './types'
import {
  activeConfirmedLedgerEntries,
  buildConfirmedLedgerDuplicateGroups,
  confirmedLedgerAccountIdentityMatches,
  getConfirmedLedgerDuplicateResolutions,
  isDuplicateResolved,
  type ConfirmedLedgerDuplicateGroup,
  type ConfirmedLedgerDuplicateResolution,
} from './confirmed-ledger-duplicates'
import {
  possiblePostedDuplicateGroups,
  transactionStatusCountsTowardSpending,
} from './plaid-transaction-lifecycle'

export type LedgerSourceTable = 'plaid_imports' | 'quick_entries'

export type LedgerSummaryTransaction = {
  id: string
  sourceTable: LedgerSourceTable
  date: string | null
  description: string | null
  amount: number
  category: string | null
  imported: boolean | null
  source: string | null
  plaidTransactionId: string | null
  metadata: Record<string, unknown>
}

export type LedgerDuplicateMatchType = 'plaid_transaction_id' | 'heuristic'

export type LedgerDuplicateMatch = {
  confirmedLedgerEntry: LedgerSummaryTransaction
  matchType: LedgerDuplicateMatchType
  confidence: number
  amountDifference: number
  dateDifferenceDays: number | null
  normalizedImportDescription: string
  normalizedLedgerDescription: string
  reasons: string[]
}

export type LedgerDuplicateCandidate = {
  importCandidate: LedgerSummaryTransaction
  bestDuplicateMatch: LedgerDuplicateMatch
  alternativeMatches: LedgerDuplicateMatch[]
}

export type LedgerSummary = {
  confirmedLedgerEntries: LedgerSummaryTransaction[]
  allConfirmedLedgerEntries: LedgerSummaryTransaction[]
  duplicateResolvedLedgerEntries: LedgerSummaryTransaction[]
  confirmedLedgerDuplicateResolutions: ConfirmedLedgerDuplicateResolution[]
  confirmedLedgerDuplicateGroups: ConfirmedLedgerDuplicateGroup[]
  manualLedgerEntries: LedgerSummaryTransaction[]
  plaidLedgerEntries: LedgerSummaryTransaction[]
  importCandidates: LedgerSummaryTransaction[]
  importedSourceRows: LedgerSummaryTransaction[]
  confirmedLedgerAmount: number
  manualLedgerAmount: number
  plaidLedgerAmount: number
  importCandidateAmount: number
  reviewCandidateAmount: number
  duplicateCandidates: LedgerDuplicateCandidate[]
  ledgerReviewCandidates: LedgerSummaryTransaction[]
  importReviewCandidates: LedgerSummaryTransaction[]
  athReviewCandidates: LedgerSummaryTransaction[]
  spendingDiagnostics: {
    pendingReplacedByPosted: number
    exactSourceIdDuplicates: number
    possibleDuplicates: number
    rowsExcludedFromSpending: number
  }
}

type PlaidImportRow = {
  id: string
  plaid_transaction_id?: string | null
  plaid_account_id?: string | null
  transaction_date?: string | null
  merchant?: string | null
  amount?: number | string | null
  suggested_category?: string | null
  plaid_category?: string | null
  imported?: boolean | null
  institution_name?: string | null
  account_name?: string | null
  account_mask?: string | null
  account_type?: string | null
  account_subtype?: string | null
  pending?: boolean | null
  pending_transaction_id?: string | null
  transaction_status?: string | null
  superseded_by_transaction_id?: string | null
  removed_at?: string | null
}

type QuickEntryRow = {
  id: string
  entry_date?: string | null
  created_at?: string | null
  description?: string | null
  amount?: number | string | null
  category?: string | null
  entry_type?: string | null
  owner?: string | null
  source?: string | null
  plaid_transaction_id?: string | null
  account_name?: string | null
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function amountCents(value: number) {
  return Math.round(Math.abs(value) * 100)
}

function dateTime(value: string | null) {
  if (!value) return null

  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function dateDifferenceDays(left: string | null, right: string | null) {
  const leftTime = dateTime(left)
  const rightTime = dateTime(right)

  if (leftTime === null || rightTime === null) return null

  return Math.round(
    Math.abs(leftTime - rightTime) / (24 * 60 * 60 * 1000)
  )
}

function normalizeDescription(value: string | null | undefined) {
  return String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' AND ')
    .replace(/[#*]\s*\d+/g, ' ')
    .replace(/\bSTORE\b/g, ' ')
    .replace(/\bPR\b/g, ' ')
    .replace(/\bPUERTO RICO\b/g, ' ')
    .replace(/\bINC\b/g, ' ')
    .replace(/\bLLC\b/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function descriptionsMatch(left: string, right: string) {
  if (!left || !right) return false
  if (left === right) return true

  const shorter = left.length <= right.length ? left : right
  const longer = left.length > right.length ? left : right

  return shorter.length >= 6 && longer.includes(shorter)
}

function isGenericAthTransaction(transaction: LedgerSummaryTransaction) {
  const normalized = normalizeDescription(transaction.description)

  return (
    /\bATH\b/.test(normalized) ||
    /\bATHM\b/.test(normalized) ||
    normalized.includes('ATH MOVIL')
  )
}

function isUncategorized(transaction: LedgerSummaryTransaction) {
  const category = transaction.category?.trim().toLowerCase()

  return (
    !category ||
    category === 'sin categoría' ||
    category === 'sin categoria' ||
    category === 'uncategorized'
  )
}

function needsReview(transaction: LedgerSummaryTransaction) {
  const category = transaction.category?.trim().toLowerCase()
  return isUncategorized(transaction) || category === 'revisar'
}

function isPlaidLedgerEntry(transaction: LedgerSummaryTransaction) {
  return transaction.source === 'plaid' || Boolean(transaction.plaidTransactionId)
}

function plaidImportTransaction(row: PlaidImportRow): LedgerSummaryTransaction {
  return {
    id: row.id,
    sourceTable: 'plaid_imports',
    date: row.transaction_date || null,
    description: row.merchant || row.plaid_category || null,
    amount: numberValue(row.amount),
    category: row.suggested_category || row.plaid_category || null,
    imported: row.imported ?? false,
    source: 'plaid',
    plaidTransactionId: row.plaid_transaction_id || null,
    metadata: {
      institutionName: row.institution_name || null,
      accountName: row.account_name || null,
      accountMask: row.account_mask || null,
      plaidAccountId: row.plaid_account_id || null,
      accountType: row.account_type || null,
      accountSubtype: row.account_subtype || null,
      suggestedCategory: row.suggested_category || null,
      plaidCategory: row.plaid_category || null,
      pending: row.pending === true,
      pendingTransactionId: row.pending_transaction_id || null,
      transactionStatus: row.transaction_status || 'active',
      supersededByTransactionId: row.superseded_by_transaction_id || null,
      removedAt: row.removed_at || null,
    },
  }
}

function quickEntryTransaction(
  row: QuickEntryRow,
  plaidImportByTransactionId: Map<string, LedgerSummaryTransaction>
): LedgerSummaryTransaction {
  const matchingPlaidImport = row.plaid_transaction_id
    ? plaidImportByTransactionId.get(row.plaid_transaction_id)
    : null

  return {
    id: row.id,
    sourceTable: 'quick_entries',
    date: row.entry_date || row.created_at?.slice(0, 10) || null,
    description: row.description || null,
    amount: numberValue(row.amount),
    category: row.category || null,
    imported: null,
    source: row.source || null,
    plaidTransactionId: row.plaid_transaction_id || null,
    metadata: {
      entryType: row.entry_type || null,
      owner: row.owner || null,
      createdAt: row.created_at || null,
      accountName:
        row.account_name ||
        (matchingPlaidImport?.metadata.accountName as string | null) ||
        null,
      institutionName:
        (matchingPlaidImport?.metadata.institutionName as string | null) ||
        null,
      accountMask:
        (matchingPlaidImport?.metadata.accountMask as string | null) || null,
      plaidAccountId:
        (matchingPlaidImport?.metadata.plaidAccountId as string | null) ||
        null,
      accountType:
        (matchingPlaidImport?.metadata.accountType as string | null) || null,
      accountSubtype:
        (matchingPlaidImport?.metadata.accountSubtype as string | null) ||
        null,
      plaidTransactionStatus:
        (matchingPlaidImport?.metadata.transactionStatus as string | null) ||
        'active',
      plaidPending:
        (matchingPlaidImport?.metadata.pending as boolean | null) || false,
      plaidPendingTransactionId:
        (matchingPlaidImport?.metadata.pendingTransactionId as string | null) ||
        null,
      plaidSupersededByTransactionId:
        (matchingPlaidImport?.metadata.supersededByTransactionId as string | null) ||
        null,
    },
  }
}

function sumAmounts(transactions: LedgerSummaryTransaction[]) {
  return transactions.reduce(
    (sum, transaction) => sum + Number(transaction.amount || 0),
    0
  )
}

function directPlaidTransactionMatch(
  importCandidate: LedgerSummaryTransaction,
  ledgerEntry: LedgerSummaryTransaction
): LedgerDuplicateMatch | null {
  if (
    !importCandidate.plaidTransactionId ||
    importCandidate.plaidTransactionId !== ledgerEntry.plaidTransactionId
  ) {
    return null
  }

  return {
    confirmedLedgerEntry: ledgerEntry,
    matchType: 'plaid_transaction_id',
    confidence: 100,
    amountDifference: Math.abs(
      Math.abs(importCandidate.amount) - Math.abs(ledgerEntry.amount)
    ),
    dateDifferenceDays: dateDifferenceDays(importCandidate.date, ledgerEntry.date),
    normalizedImportDescription: normalizeDescription(importCandidate.description),
    normalizedLedgerDescription: normalizeDescription(ledgerEntry.description),
    reasons: ['Plaid transaction id already exists in confirmed ledger.'],
  }
}

function duplicateAccountIdentityMatches(
  importCandidate: LedgerSummaryTransaction,
  ledgerEntry: LedgerSummaryTransaction
) {
  return confirmedLedgerAccountIdentityMatches(importCandidate, ledgerEntry)
}

function heuristicDuplicateMatch(
  importCandidate: LedgerSummaryTransaction,
  ledgerEntry: LedgerSummaryTransaction
): LedgerDuplicateMatch | null {
  if (!duplicateAccountIdentityMatches(importCandidate, ledgerEntry)) {
    return null
  }

  if (amountCents(importCandidate.amount) !== amountCents(ledgerEntry.amount)) {
    return null
  }

  const days = dateDifferenceDays(importCandidate.date, ledgerEntry.date)

  if (days === null || days > 1) return null

  const normalizedImportDescription = normalizeDescription(
    importCandidate.description
  )
  const normalizedLedgerDescription = normalizeDescription(
    ledgerEntry.description
  )

  if (
    !descriptionsMatch(
      normalizedImportDescription,
      normalizedLedgerDescription
    )
  ) {
    return null
  }

  return {
    confirmedLedgerEntry: ledgerEntry,
    matchType: 'heuristic',
    confidence: days === 0 ? 65 : 55,
    amountDifference: Math.abs(
      Math.abs(importCandidate.amount) - Math.abs(ledgerEntry.amount)
    ),
    dateDifferenceDays: days,
    normalizedImportDescription,
    normalizedLedgerDescription,
    reasons: [
      'Account identity matches.',
      'Amounts match.',
      'Dates are within one day.',
      'Merchant and description normalize to a similar value.',
    ],
  }
}

function duplicateMatchesForImportCandidate(
  importCandidate: LedgerSummaryTransaction,
  confirmedLedgerEntries: LedgerSummaryTransaction[]
) {
  const directMatches = confirmedLedgerEntries
    .map((ledgerEntry) =>
      directPlaidTransactionMatch(importCandidate, ledgerEntry)
    )
    .filter((match): match is LedgerDuplicateMatch => match !== null)

  if (directMatches.length > 0) return directMatches

  if (isGenericAthTransaction(importCandidate)) return []

  return confirmedLedgerEntries
    .map((ledgerEntry) =>
      heuristicDuplicateMatch(importCandidate, ledgerEntry)
    )
    .filter((match): match is LedgerDuplicateMatch => match !== null)
}

function duplicateCandidates(
  importCandidates: LedgerSummaryTransaction[],
  confirmedLedgerEntries: LedgerSummaryTransaction[]
) {
  return importCandidates.flatMap((importCandidate) => {
    const matches = duplicateMatchesForImportCandidate(
      importCandidate,
      confirmedLedgerEntries
    ).sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence
      if (a.dateDifferenceDays !== b.dateDifferenceDays) {
        return (
          Number(a.dateDifferenceDays ?? 999) -
          Number(b.dateDifferenceDays ?? 999)
        )
      }
      return a.amountDifference - b.amountDifference
    })

    const bestDuplicateMatch = matches[0]
    if (!bestDuplicateMatch) return []

    return [{
      importCandidate,
      bestDuplicateMatch,
      alternativeMatches: matches.slice(1),
    }]
  })
}

function uniqueTransactions(transactions: LedgerSummaryTransaction[]) {
  const seen = new Set<string>()

  return transactions.filter((transaction) => {
    const key = `${transaction.sourceTable}:${transaction.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function activePlaidSourceTransaction(transaction: LedgerSummaryTransaction) {
  if (!transaction.plaidTransactionId) return true
  return transactionStatusCountsTowardSpending(
    transaction.metadata.plaidTransactionStatus as string | null,
    transaction.metadata.plaidPending === true
  )
}

function uniqueConfirmedSourceTransactions(transactions: LedgerSummaryTransaction[]) {
  const seenPlaidIds = new Set<string>()
  let exactSourceIdDuplicates = 0
  const rows = transactions.filter((transaction) => {
    if (!transaction.plaidTransactionId) return true
    if (seenPlaidIds.has(transaction.plaidTransactionId)) {
      exactSourceIdDuplicates += 1
      return false
    }
    seenPlaidIds.add(transaction.plaidTransactionId)
    return true
  })
  return { rows, exactSourceIdDuplicates }
}

export async function getLedgerSummary(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<LedgerSummary> {
  const [
    plaidImportsResult,
    quickEntriesResult,
    confirmedLedgerDuplicateResolutions,
  ] = await Promise.all([
    supabase
      .from('plaid_imports')
      .select('*')
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false }),
    supabase
      .from('quick_entries')
      .select(
        'id, entry_date, created_at, description, amount, category, entry_type, owner, source, plaid_transaction_id, account_name'
      )
      .eq('user_id', userId)
      .order('entry_date', { ascending: false }),
    getConfirmedLedgerDuplicateResolutions(supabase, userId),
  ])

  if (plaidImportsResult.error) throw plaidImportsResult.error
  if (quickEntriesResult.error) throw quickEntriesResult.error

  const plaidSourceRows = ((plaidImportsResult.data || []) as PlaidImportRow[])
    .map(plaidImportTransaction)
  const plaidImportByTransactionId = new Map(
    plaidSourceRows
      .filter((transaction) => transaction.plaidTransactionId)
      .map((transaction) => [transaction.plaidTransactionId as string, transaction])
  )
  const allConfirmedLedgerEntries =
    ((quickEntriesResult.data || []) as QuickEntryRow[])
      .map((row) => quickEntryTransaction(row, plaidImportByTransactionId))
  const resolutionFilteredLedgerEntries = activeConfirmedLedgerEntries(
    allConfirmedLedgerEntries,
    confirmedLedgerDuplicateResolutions
  )
  const sourceLifecycleFilteredLedgerEntries =
    resolutionFilteredLedgerEntries.filter(activePlaidSourceTransaction)
  const exactSourceDeduplication = uniqueConfirmedSourceTransactions(
    sourceLifecycleFilteredLedgerEntries
  )
  const confirmedLedgerEntries = exactSourceDeduplication.rows
  const duplicateResolvedLedgerEntries = allConfirmedLedgerEntries.filter(
    (transaction) =>
      isDuplicateResolved(transaction, confirmedLedgerDuplicateResolutions)
  )
  const confirmedLedgerDuplicateGroups = buildConfirmedLedgerDuplicateGroups(
    allConfirmedLedgerEntries,
    confirmedLedgerDuplicateResolutions
  )
  const plaidLedgerEntries = confirmedLedgerEntries.filter(isPlaidLedgerEntry)
  const manualLedgerEntries = confirmedLedgerEntries.filter(
    (transaction) => !isPlaidLedgerEntry(transaction)
  )
  const importCandidates = plaidSourceRows.filter(
    (transaction) => transaction.imported !== true
  )
  const importedSourceRows = plaidSourceRows.filter(
    (transaction) => transaction.imported === true
  )
  const ledgerReviewCandidates = confirmedLedgerEntries.filter(needsReview)
  const athReviewCandidates = importCandidates.filter(isGenericAthTransaction)
  const importReviewCandidates = importCandidates.filter(
    (transaction) =>
      needsReview(transaction) || isGenericAthTransaction(transaction)
  )
  const allReviewCandidates = uniqueTransactions([
    ...ledgerReviewCandidates,
    ...importReviewCandidates,
  ])
  const possibleDuplicates = possiblePostedDuplicateGroups(
    confirmedLedgerEntries
      .filter((transaction) => Boolean(transaction.plaidTransactionId))
      .map((transaction) => ({
        transactionId: transaction.plaidTransactionId as string,
        pendingTransactionId:
          (transaction.metadata.plaidPendingTransactionId as string | null) || null,
        pending: transaction.metadata.plaidPending === true,
        accountId:
          (transaction.metadata.plaidAccountId as string | null) || null,
        merchant: transaction.description || '',
        amount: transaction.amount,
        date: transaction.date || '',
        status:
          (transaction.metadata.plaidTransactionStatus as 'active' | undefined) ||
          'active',
      }))
  )
  const pendingReplacedByPosted = plaidSourceRows.filter(
    (transaction) => transaction.metadata.transactionStatus === 'superseded'
  ).length
  const lifecycleExcluded =
    resolutionFilteredLedgerEntries.length - sourceLifecycleFilteredLedgerEntries.length

  return {
    confirmedLedgerEntries,
    allConfirmedLedgerEntries,
    duplicateResolvedLedgerEntries,
    confirmedLedgerDuplicateResolutions,
    confirmedLedgerDuplicateGroups,
    manualLedgerEntries,
    plaidLedgerEntries,
    importCandidates,
    importedSourceRows,
    confirmedLedgerAmount: sumAmounts(confirmedLedgerEntries),
    manualLedgerAmount: sumAmounts(manualLedgerEntries),
    plaidLedgerAmount: sumAmounts(plaidLedgerEntries),
    importCandidateAmount: sumAmounts(importCandidates),
    reviewCandidateAmount: sumAmounts(allReviewCandidates),
    duplicateCandidates: duplicateCandidates(
      importCandidates,
      confirmedLedgerEntries
    ),
    ledgerReviewCandidates,
    importReviewCandidates,
    athReviewCandidates,
    spendingDiagnostics: {
      pendingReplacedByPosted,
      exactSourceIdDuplicates: exactSourceDeduplication.exactSourceIdDuplicates,
      possibleDuplicates: possibleDuplicates.length,
      rowsExcludedFromSpending:
        lifecycleExcluded + exactSourceDeduplication.exactSourceIdDuplicates +
        duplicateResolvedLedgerEntries.length,
    },
  }
}
