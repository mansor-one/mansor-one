import { reconcileMovement } from '@/lib/finance/reconcileMovement'
import type { FinancialSupabaseClient } from './types'

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
  transaction_date: string | null
  merchant: string | null
  amount: number | string | null
  suggested_category: string | null
  plaid_transaction_id: string | null
  imported?: boolean | null
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
  user_id?: string | null
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

    return (data as QuickEntryRow | null) || null
  }

  let query = supabase
    .from('quick_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('source', 'plaid')
    .eq('amount', Number(plaidImport.amount || 0))
    .limit(1)

  query = plaidImport.transaction_date
    ? query.eq('entry_date', plaidImport.transaction_date)
    : query.is('entry_date', null)

  query = plaidImport.merchant
    ? query.eq('description', plaidImport.merchant)
    : query.is('description', null)

  const { data, error } = await query

  if (error) {
    throw new LedgerPromotionError(
      'duplicate_check_failed',
      'Could not check existing quick entry',
      error
    )
  }

  return ((data as QuickEntryRow[] | null) || [])[0] || null
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
