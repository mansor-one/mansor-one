import { requireUser } from '@/lib/auth/requireUser'
import {
  type LedgerSummaryTransaction,
  getLedgerSummary,
  transactionContext,
  type TransactionContext,
} from '@/lib/financial-engine'
import Nav from '../components/Nav'

export const dynamic = 'force-dynamic'

type HistoryEntry = {
  id: string
  description: string
  type: string
  category: string
  account: string
  amount: number
  owner: string
  date: string
  displayDate: string
  source: string
  context: TransactionContext
}

function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString()}`
}

function formatDatePR(dateString: string) {
  const date = new Date(dateString)
  date.setHours(date.getHours() - 4)

  return date.toLocaleString('es-PR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function metadataString(
  transaction: LedgerSummaryTransaction,
  key: string,
  fallback: string
) {
  const value = transaction.metadata[key]
  return typeof value === 'string' && value.trim() ? value : fallback
}

function historyEntry(transaction: LedgerSummaryTransaction): HistoryEntry {
  const date = transaction.date || new Date().toISOString().slice(0, 10)

  return {
    id: transaction.id,
    description: transaction.description || 'Movimiento registrado',
    type: metadataString(transaction, 'entryType', 'expense'),
    category: transaction.category || 'Sin categoría',
    account: metadataString(transaction, 'accountName', 'N/A'),
    amount: Number(transaction.amount || 0),
    owner: metadataString(transaction, 'owner', 'N/A'),
    date,
    displayDate: formatDatePR(date),
    source: transaction.source || 'Registrado',
    context: transactionContext(transaction),
  }
}

export default async function HistoryPage() {
  const { supabase, user } = await requireUser()
  const ledgerSummary = await getLedgerSummary(supabase, user.id)

  // History uses confirmed ledger only. Import candidates are excluded until
  // promoted.
  const entries = ledgerSummary.confirmedLedgerEntries
    .map(historyEntry)
    .sort((a, b) => b.date.localeCompare(a.date))

  const totalExpenses = entries
    .filter((entry) => entry.type !== 'income')
    .filter((entry) => entry.amount > 0)
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)

  const totalIncome = entries
    .filter((entry) => entry.type === 'income' || entry.amount < 0)
    .reduce((sum, entry) => sum + Math.abs(Number(entry.amount || 0)), 0)

  const netTotal = totalIncome - totalExpenses

  const categoryTotals = entries
    .filter((entry) => entry.type !== 'income')
    .filter((entry) => entry.amount > 0)
    .reduce((acc: Record<string, number>, entry) => {
      const category = entry.category || 'Sin categoría'
      acc[category] = (acc[category] || 0) + Number(entry.amount || 0)
      return acc
    }, {})

  const categoryRows = Object.entries(categoryTotals).sort(
    (a, b) => b[1] - a[1]
  )

  const hasPendingImportReview =
    ledgerSummary.importReviewCandidates.length > 0 ||
    ledgerSummary.athReviewCandidates.length > 0

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">📜 Historial</h1>

      <Nav />

      {hasPendingImportReview && (
        <section className="border rounded p-4">
          Hay transacciones pendientes de revisión que todavía no aparecen en
          este historial.
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">💸 Gastos registrados</h2>
          <p className="text-3xl font-bold">{formatMoney(totalExpenses)}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">💰 Ingresos registrados</h2>
          <p className="text-3xl font-bold">{formatMoney(totalIncome)}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">📊 Neto registrado</h2>
          <p className="text-3xl font-bold">{formatMoney(netTotal)}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">📌 Movimientos</h2>
          <p className="text-3xl font-bold">{entries.length}</p>
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-4">📊 Gastos por categoría</h2>

        <div className="space-y-2">
          {categoryRows.map(([category, total]) => (
            <div
              key={category}
              className="flex justify-between border rounded p-3"
            >
              <span>{category}</span>
              <strong>{formatMoney(total)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {entries.slice(0, 100).map((entry) => (
          <div key={entry.id} className="border rounded p-4">
            <h2 className="font-bold text-lg">{entry.description}</h2>
            <p>Origen: {entry.source}</p>
            <p>Source: {entry.context.source}</p>
            <p>Institución: {entry.context.institution}</p>
            <p>Cuenta: {entry.context.accountLabel}</p>
            <p>Dueño de cuenta: {entry.context.accountOwner}</p>
            <p>Método: {entry.context.paymentMethod}</p>
            <p>Merchant normalizado: {entry.context.normalizedMerchant}</p>
            <p>Merchant raw: {entry.context.rawMerchant}</p>
            <p>Identidad: {entry.context.identity}</p>
            <p>Tipo: {entry.type}</p>
            <p>Categoría: {entry.category || 'Sin categoría'}</p>
            <p>Cuenta legacy: {entry.account}</p>
            <p>Monto: {formatMoney(Math.abs(Number(entry.amount || 0)))}</p>
            <p>Dueño: {entry.owner}</p>
            <p>Fecha: {entry.displayDate}</p>
          </div>
        ))}
      </section>
    </main>
  )
}
