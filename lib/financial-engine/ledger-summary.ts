import type { FinancialSupabaseClient } from './types'

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

export type LedgerDuplicateCandidate = {
  importedTransaction: LedgerSummaryTransaction
  manualTransaction: LedgerSummaryTransaction
  amountDifference: number
  dateDifferenceDays: number
  normalizedImportedDescription: string
  normalizedManualDescription: string
  reasons: string[]
}

export type LedgerSummary = {
  importedTransactions: LedgerSummaryTransaction[]
  manualTransactions: LedgerSummaryTransaction[]
  totalImported: number
  totalManual: number
  totalTransactions: number
  importedAmount: number
  manualAmount: number
  totalAmount: number
  duplicateCandidates: LedgerDuplicateCandidate[]
  uncategorizedTransactions: LedgerSummaryTransaction[]
  reviewCandidates: LedgerSummaryTransaction[]
}

type PlaidImportRow = {
  id: string
  plaid_transaction_id?: string | null
  transaction_date?: string | null
  merchant?: string | null
  amount?: number | string | null
  suggested_category?: string | null
  plaid_category?: string | null
  imported?: boolean | null
  institution_name?: string | null
  account_name?: string | null
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

  return shorter.length >= 4 && longer.includes(shorter)
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

  if (transaction.sourceTable === 'plaid_imports' && transaction.imported) {
    return false
  }

  return isUncategorized(transaction) || category === 'revisar'
}

function plaidImportTransaction(row: PlaidImportRow): LedgerSummaryTransaction {
  return {
    id: row.id,
    sourceTable: 'plaid_imports',
    date: row.transaction_date || null,
    description: row.merchant || row.plaid_category || null,
    amount: numberValue(row.amount),
    category: row.suggested_category || row.plaid_category || null,
    imported: row.imported ?? null,
    source: 'plaid',
    plaidTransactionId: row.plaid_transaction_id || null,
    metadata: {
      institutionName: row.institution_name || null,
      accountName: row.account_name || null,
      plaidCategory: row.plaid_category || null,
    },
  }
}

function quickEntryTransaction(row: QuickEntryRow): LedgerSummaryTransaction {
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
      accountName: row.account_name || null,
    },
  }
}

function sumAmounts(transactions: LedgerSummaryTransaction[]) {
  return transactions.reduce(
    (sum, transaction) => sum + Number(transaction.amount || 0),
    0
  )
}

function duplicateCandidate(
  importedTransaction: LedgerSummaryTransaction,
  manualTransaction: LedgerSummaryTransaction
): LedgerDuplicateCandidate | null {
  if (amountCents(importedTransaction.amount) !== amountCents(manualTransaction.amount)) {
    return null
  }

  const days = dateDifferenceDays(
    importedTransaction.date,
    manualTransaction.date
  )

  if (days === null || days > 1) return null

  const normalizedImportedDescription = normalizeDescription(
    importedTransaction.description
  )
  const normalizedManualDescription = normalizeDescription(
    manualTransaction.description
  )

  if (
    !descriptionsMatch(
      normalizedImportedDescription,
      normalizedManualDescription
    )
  ) {
    return null
  }

  return {
    importedTransaction,
    manualTransaction,
    amountDifference: Math.abs(
      Math.abs(importedTransaction.amount) - Math.abs(manualTransaction.amount)
    ),
    dateDifferenceDays: days,
    normalizedImportedDescription,
    normalizedManualDescription,
    reasons: [
      'Amounts match.',
      'Dates are within one day.',
      'Merchant and description normalize to a similar value.',
    ],
  }
}

function duplicateCandidates(
  importedTransactions: LedgerSummaryTransaction[],
  manualTransactions: LedgerSummaryTransaction[]
) {
  return importedTransactions.flatMap((importedTransaction) =>
    manualTransactions
      .map((manualTransaction) =>
        duplicateCandidate(importedTransaction, manualTransaction)
      )
      .filter(
        (candidate): candidate is LedgerDuplicateCandidate =>
          candidate !== null
      )
  )
}

export async function getLedgerSummary(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<LedgerSummary> {
  const [plaidImportsResult, quickEntriesResult] = await Promise.all([
    supabase
      .from('plaid_imports')
      .select(
        'id, plaid_transaction_id, transaction_date, merchant, amount, suggested_category, plaid_category, imported, institution_name, account_name'
      )
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false }),
    supabase
      .from('quick_entries')
      .select(
        'id, entry_date, created_at, description, amount, category, entry_type, owner, source, plaid_transaction_id, account_name'
      )
      .eq('user_id', userId)
      .order('entry_date', { ascending: false }),
  ])

  if (plaidImportsResult.error) throw plaidImportsResult.error
  if (quickEntriesResult.error) throw quickEntriesResult.error

  const importedTransactions = ((plaidImportsResult.data || []) as PlaidImportRow[])
    .map(plaidImportTransaction)
  const manualTransactions = ((quickEntriesResult.data || []) as QuickEntryRow[])
    .map(quickEntryTransaction)
  const transactions = [...importedTransactions, ...manualTransactions]
  const importedAmount = sumAmounts(importedTransactions)
  const manualAmount = sumAmounts(manualTransactions)

  return {
    importedTransactions,
    manualTransactions,
    totalImported: importedTransactions.length,
    totalManual: manualTransactions.length,
    totalTransactions: transactions.length,
    importedAmount,
    manualAmount,
    totalAmount: importedAmount + manualAmount,
    duplicateCandidates: duplicateCandidates(
      importedTransactions,
      manualTransactions
    ),
    uncategorizedTransactions: transactions.filter(isUncategorized),
    reviewCandidates: transactions.filter(needsReview),
  }
}
