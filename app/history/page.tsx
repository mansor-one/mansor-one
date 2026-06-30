import { requireUser } from '@/lib/auth/requireUser'
import {
  canonicalCategoryCodeForText,
  commonMerchantDefaultCategoryCode,
  getCategoryByCode,
  getLedgerSummary,
  type LedgerSummaryTransaction,
  transactionContext,
} from '@/lib/financial-engine'
import Nav from '../components/Nav'
import HistoryClient, { type HistoryMovement } from './HistoryClient'

export const dynamic = 'force-dynamic'

function categoryFromCode(code: string | null) {
  return code ? getCategoryByCode(code) : null
}

function resolvedCategoryCode(transaction: LedgerSummaryTransaction) {
  const ledgerCategoryCode = canonicalCategoryCodeForText(transaction.category)
  const merchantDefaultCode = commonMerchantDefaultCategoryCode(
    transaction.description
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

function movementFromTransaction(
  transaction: LedgerSummaryTransaction
): HistoryMovement | null {
  if (!transaction.date) return null

  const context = transactionContext(transaction)
  const categoryCode = resolvedCategoryCode(transaction)
  const category = categoryFromCode(categoryCode)

  return {
    id: `${transaction.sourceTable}:${transaction.id}`,
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

  return (
    <main className="space-y-6 p-4 md:p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Historial</h1>
        <p className="max-w-3xl text-sm opacity-70">
          Movimientos confirmados para buscar, filtrar y auditar tu actividad.
          Los pendientes por clasificar se revisan aparte.
        </p>
      </div>

      <Nav />

      <HistoryClient movements={movements} />
    </main>
  )
}
