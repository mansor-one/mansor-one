import { requireUser } from '@/lib/auth/requireUser'
import {
  canonicalCategoryCodeForText,
  commonMerchantDefaultCategoryCode,
  getCategoryByCode,
  getSystemCategories,
  getLedgerSummary,
  type LedgerSummaryTransaction,
  transactionContext,
} from '@/lib/financial-engine'
import type { Metadata } from 'next'
import AppShell from '../components/AppShell'
import HistoryClient, { type HistoryMovement } from './HistoryClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Movimientos | Mansor One',
}

function categoryFromCode(code: string | null) {
  return code ? getCategoryByCode(code) : null
}

function resolvedCategoryCode(transaction: LedgerSummaryTransaction) {
  const ledgerCategoryCode = canonicalCategoryCodeForText(transaction.category)
  const merchantDefaultCode = commonMerchantDefaultCategoryCode(
    transaction.description,
    { amount: transaction.amount }
  )
  const ledgerCategory = categoryFromCode(ledgerCategoryCode)
  const merchantDefault = categoryFromCode(merchantDefaultCode)

  if (
    merchantDefault?.kind === 'expense' &&
    ledgerCategory &&
    ledgerCategory.kind !== 'expense'
  ) {
    return merchantDefault.code
  }

  return ledgerCategoryCode || merchantDefaultCode
}

function hasKnownValue(value: string | null | undefined) {
  return Boolean(value && value !== 'Unknown')
}

function displayInstitution(value: string) {
  return hasKnownValue(value) ? value : 'Institución no identificada'
}

function displayAccount(accountLabel: string, accountMask: string | null) {
  if (hasKnownValue(accountLabel)) return accountLabel

  if (accountMask) {
    return `Cuenta no identificada ••••${accountMask}`
  }

  return 'Cuenta no identificada'
}

function displayPaymentMethod(value: string) {
  if (value === 'Credit') return 'Crédito'
  if (value === 'Debit') return 'Débito'
  if (value === 'Transfer') return 'Transferencia'

  return hasKnownValue(value) ? value : 'Método no identificado'
}

function uniqueCategoryOptions() {
  const seen = new Set<string>()

  return getSystemCategories()
    .filter((category) => {
      const value = category.displayName.trim()
      if (seen.has(value)) return false
      seen.add(value)
      return true
    })
    .map((category) => ({
      value: category.displayName,
      label: category.displayName,
      kind: category.kind,
    }))
}

function movementFromTransaction(
  transaction: LedgerSummaryTransaction
): HistoryMovement | null {
  if (!transaction.date) return null

  const context = transactionContext(transaction)
  const categoryCode = resolvedCategoryCode(transaction)
  const category = categoryFromCode(categoryCode)

  return {
    id: `${transaction.sourceTable}:${transaction.id}`,
    sourceTable: transaction.sourceTable,
    quickEntryId:
      transaction.sourceTable === 'quick_entries' ? transaction.id : null,
    date: transaction.date,
    merchant: context.normalizedMerchant || context.rawMerchant,
    rawMerchant: context.rawMerchant,
    amount: Number(transaction.amount || 0),
    categoryCode,
    category: category?.displayName || 'Pendiente de categoría',
    categoryKind: category?.kind || 'adjustment',
    institution: displayInstitution(context.institution),
    account: displayAccount(context.accountLabel, context.accountMask),
    bankAccount: `${displayInstitution(context.institution)} / ${displayAccount(
      context.accountLabel,
      context.accountMask
    )}`,
    paymentMethod: displayPaymentMethod(context.paymentMethod),
    identity: context.identity,
  }
}

export default async function HistoryPage() {
  const { supabase, user } = await requireUser()
  const ledgerSummary = await getLedgerSummary(supabase, user.id)

  const movements = ledgerSummary.confirmedLedgerEntries
    .map(movementFromTransaction)
    .filter((movement): movement is HistoryMovement => movement !== null)
    .sort((a, b) => b.date.localeCompare(a.date))
  const resolvedDuplicateMovements = ledgerSummary.duplicateResolvedLedgerEntries
    .map(movementFromTransaction)
    .filter((movement): movement is HistoryMovement => movement !== null)
    .sort((a, b) => b.date.localeCompare(a.date))
  const categoryOptions = uniqueCategoryOptions()

  return (
    <AppShell
      header={{
        eyebrow: 'Historial financiero',
        title: 'Movimientos',
        subtitle:
          'Movimientos confirmados para buscar, filtrar y auditar. Los pendientes por clasificar se revisan aparte.',
      }}
    >
      <HistoryClient
        categoryOptions={categoryOptions}
        movements={movements}
        resolvedDuplicateMovements={resolvedDuplicateMovements}
      />
    </AppShell>
  )
}
