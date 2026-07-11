import { reconcileMovement } from '@/lib/finance/reconcileMovement'
import type { FinancialSupabaseClient } from './types'
import {
  confirmedLedgerEntriesMatchExactly,
  getConfirmedLedgerDuplicateResolutions,
  isDuplicateResolved,
} from './confirmed-ledger-duplicates'
import type { LedgerSummaryTransaction } from './ledger-summary'

export type PromotePlaidImportInput = {
  plaidImportId: string
  selectedCategory?: string | null
  reviewClassification?: string | null
  sourceRoute?: string | null
  skipReconciliation?: boolean
}

export type PlaidImportPromotionResult = {
  plaidImport: PlaidImportRow
  quickEntry: QuickEntryRow
  alreadyImported: boolean
  reconciled: boolean
}

export type LedgerPromotionErrorCode =
  | 'plaid_import_not_found'
  | 'duplicate_check_failed'
  | 'quick_entry_insert_failed'
  | 'reconciliation_failed'
  | 'plaid_import_existing_update_failed'
  | 'plaid_import_update_failed'

export class LedgerPromotionError extends Error {
  code: LedgerPromotionErrorCode
  cause: unknown

  constructor(
    code: LedgerPromotionErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message)
    this.name = 'LedgerPromotionError'
    this.code = code
    this.cause = cause
    Object.setPrototypeOf(this, LedgerPromotionError.prototype)
  }
}

type PlaidImportRow = {
  id: string
  user_id: string
  plaid_account_id?: string | null
  transaction_date: string | null
  merchant: string | null
  amount: number | string | null
  suggested_category: string | null
  plaid_category?: string | null
  plaid_transaction_id: string | null
  imported?: boolean | null
  institution_name?: string | null
  account_name?: string | null
  account_mask?: string | null
  account_type?: string | null
  account_subtype?: string | null
}

type QuickEntryRow = {
  id: string
  entry_date?: string | null
  transaction_date?: string | null
  description?: string | null
  amount?: number | string | null
  category?: string | null
  entry_type?: string | null
  owner?: string | null
  source?: string | null
  plaid_transaction_id?: string | null
  account_name?: string | null
  created_at?: string | null
  user_id?: string | null
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
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
    },
  }
}

function normalizedCategory(plaidImport: PlaidImportRow, selectedCategory?: string | null) {
  let category = selectedCategory || plaidImport.suggested_category || 'Revisar'

  if (category === 'Transferencia') {
    category =
      Number(plaidImport.amount) < 0
        ? 'Transferencia Enviada'
        : 'Transferencia Recibida'
  }

  return category
}

async function findExistingQuickEntry(
  supabase: FinancialSupabaseClient,
  userId: string,
  plaidImport: PlaidImportRow
) {
  let directMatch: QuickEntryRow | null = null

  if (plaidImport.plaid_transaction_id) {
    const { data, error } = await supabase
      .from('quick_entries')
      .select('*')
      .eq('plaid_transaction_id', plaidImport.plaid_transaction_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      throw new LedgerPromotionError(
        'duplicate_check_failed',
        'Could not check existing quick entry',
        error
      )
    }

    directMatch = (data as QuickEntryRow | null) || null

    if (directMatch) return directMatch
  }

  let query = supabase
    .from('quick_entries')
    .select(
      'id, entry_date, created_at, description, amount, category, entry_type, owner, source, plaid_transaction_id, account_name, user_id'
    )
    .eq('user_id', userId)
    .eq('source', 'plaid')
    .eq('amount', Number(plaidImport.amount || 0))
    .limit(50)

  query = plaidImport.transaction_date
    ? query.eq('entry_date', plaidImport.transaction_date)
    : query.is('entry_date', null)

  const { data, error } = await query

  if (error) {
    throw new LedgerPromotionError(
      'duplicate_check_failed',
      'Could not check existing quick entry',
      error
    )
  }

  const candidateRows = (data as QuickEntryRow[] | null) || []

  if (candidateRows.length === 0) return null

  const transactionIds = [
    plaidImport.plaid_transaction_id,
    ...candidateRows.map((row) => row.plaid_transaction_id),
  ].filter((value): value is string => Boolean(value))
  const plaidImportsByTransactionId = new Map<string, LedgerSummaryTransaction>()

  if (transactionIds.length > 0) {
    const { data: sourceRows, error: sourceError } = await supabase
      .from('plaid_imports')
      .select(
        'id, plaid_transaction_id, plaid_account_id, transaction_date, merchant, amount, suggested_category, plaid_category, imported, institution_name, account_name, account_mask, account_type, account_subtype'
      )
      .eq('user_id', userId)
      .in('plaid_transaction_id', transactionIds)

    if (sourceError) {
      throw new LedgerPromotionError(
        'duplicate_check_failed',
        'Could not load Plaid source rows for duplicate check',
        sourceError
      )
    }

    ;((sourceRows || []) as PlaidImportRow[]).forEach((sourceRow) => {
      const transaction = plaidImportTransaction(sourceRow)
      if (transaction.plaidTransactionId) {
        plaidImportsByTransactionId.set(
          transaction.plaidTransactionId,
          transaction
        )
      }
    })
  }

  const incomingTransaction = plaidImportTransaction(plaidImport)
  const resolutions = await getConfirmedLedgerDuplicateResolutions(
    supabase,
    userId
  )

  return (
    candidateRows.find((row) => {
      const candidateTransaction = quickEntryTransaction(
        row,
        plaidImportsByTransactionId
      )

      if (isDuplicateResolved(candidateTransaction, resolutions)) return false

      return confirmedLedgerEntriesMatchExactly(
        incomingTransaction,
        candidateTransaction
      )
    }) || null
  )
}

async function markPlaidImportImported(
  supabase: FinancialSupabaseClient,
  userId: string,
  plaidImportId: string,
  existingQuickEntry: boolean
) {
  const { error } = await supabase
    .from('plaid_imports')
    .update({ imported: true })
    .eq('id', plaidImportId)
    .eq('user_id', userId)

  if (error) {
    throw new LedgerPromotionError(
      existingQuickEntry
        ? 'plaid_import_existing_update_failed'
        : 'plaid_import_update_failed',
      'Could not mark Plaid import as imported',
      error
    )
  }
}

export async function promotePlaidImportToQuickEntry(
  supabase: FinancialSupabaseClient,
  userId: string,
  input: PromotePlaidImportInput
): Promise<PlaidImportPromotionResult> {
  const { data: item, error: itemError } = await supabase
    .from('plaid_imports')
    .select('*')
    .eq('id', input.plaidImportId)
    .eq('user_id', userId)
    .single()

  if (itemError || !item) {
    throw new LedgerPromotionError(
      'plaid_import_not_found',
      'Plaid import not found',
      itemError
    )
  }

  const plaidImport = item as PlaidImportRow

  if (plaidImport.user_id !== userId) {
    throw new LedgerPromotionError(
      'plaid_import_not_found',
      'Plaid import not found'
    )
  }

  const existingEntry = await findExistingQuickEntry(supabase, userId, plaidImport)

  if (existingEntry) {
    await markPlaidImportImported(supabase, userId, plaidImport.id, true)

    return {
      plaidImport,
      quickEntry: existingEntry,
      alreadyImported: true,
      reconciled: false,
    }
  }

  const category = normalizedCategory(plaidImport, input.selectedCategory)
  const { data: insertedEntry, error: entryError } = await supabase
    .from('quick_entries')
    .insert({
      entry_date: plaidImport.transaction_date,
      description: plaidImport.merchant,
      amount: Number(plaidImport.amount || 0),
      entry_type: Number(plaidImport.amount) < 0 ? 'income' : 'expense',
      owner: 'Manuel',
      category,
      source: 'plaid',
      plaid_transaction_id: plaidImport.plaid_transaction_id,
      user_id: userId,
    })
    .select('*')
    .single()

  if (entryError || !insertedEntry) {
    throw new LedgerPromotionError(
      'quick_entry_insert_failed',
      'Could not create quick entry',
      entryError
    )
  }

  if (input.skipReconciliation !== true) {
    try {
      await reconcileMovement(supabase, insertedEntry)
    } catch (error) {
      throw new LedgerPromotionError(
        'reconciliation_failed',
        'Quick entry was created but reconciliation failed',
        error
      )
    }
  }

  await markPlaidImportImported(supabase, userId, plaidImport.id, false)

  return {
    plaidImport,
    quickEntry: insertedEntry as QuickEntryRow,
    alreadyImported: false,
    reconciled: input.skipReconciliation !== true,
  }
}
