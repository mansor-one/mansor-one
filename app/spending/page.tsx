import { requireUser } from '@/lib/auth/requireUser'
import {
  type LedgerSummaryTransaction,
  getLedgerSummary,
} from '@/lib/financial-engine'
import Nav from '../components/Nav'

export const dynamic = 'force-dynamic'

type SpendingEntry = {
  id: string
  date: string
  description: string
  category: string
  amount: number
  source: string
}

function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString()}`
}

function transactionSource(transaction: LedgerSummaryTransaction) {
  if (transaction.plaidTransactionId || transaction.source === 'plaid') {
    return 'Banco'
  }

  return 'Manual'
}

function spendingEntry(
  transaction: LedgerSummaryTransaction
): SpendingEntry | null {
  if (!transaction.date) return null

  return {
    id: `${transaction.sourceTable}-${transaction.id}`,
    date: transaction.date,
    description: transaction.description || 'Movimiento registrado',
    category: transaction.category || 'Sin categoría',
    amount: Number(transaction.amount || 0),
    source: transactionSource(transaction),
  }
}

export default async function SpendingPage() {
  const { supabase, user } = await requireUser()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  const startOfMonth = new Date(year, month, 1).toISOString().slice(0, 10)
  const today = now.toISOString().slice(0, 10)

  const day = now.getDate()
  const startOfQuincena =
    day <= 15
      ? new Date(year, month, 1).toISOString().slice(0, 10)
      : new Date(year, month, 16).toISOString().slice(0, 10)

  const ledgerSummary = await getLedgerSummary(supabase, user.id)

  const excludedCategories = [
    'Transferencia Recibida',
    'Transferencia',
    'Ingreso',
    'Income',
    'Efectivo',
  ]

  // Spending uses confirmed ledger only. Plaid import candidates are excluded
  // until promoted into quick_entries.
  const entries = ledgerSummary.confirmedLedgerEntries
    .filter(
      (transaction) =>
        transaction.date &&
        transaction.date >= startOfMonth &&
        transaction.date <= today
    )
    .map(spendingEntry)
    .filter((entry): entry is SpendingEntry => entry !== null)
    .filter((entry) => entry.amount > 0)
    .filter((entry) => !excludedCategories.includes(entry.category || ''))
    .sort((a, b) => b.date.localeCompare(a.date))

  const monthlyTotals: Record<string, { total: number; count: number }> = {}
  const quincenaTotals: Record<string, { total: number; count: number }> = {}

  entries.forEach((entry) => {
    const category = entry.category || 'Sin categoría'

    if (!monthlyTotals[category]) {
      monthlyTotals[category] = { total: 0, count: 0 }
    }

    monthlyTotals[category].total += entry.amount
    monthlyTotals[category].count += 1

    if (entry.date >= startOfQuincena) {
      if (!quincenaTotals[category]) {
        quincenaTotals[category] = { total: 0, count: 0 }
      }

      quincenaTotals[category].total += entry.amount
      quincenaTotals[category].count += 1
    }
  })

  const monthlyRows = Object.entries(monthlyTotals).sort(
    (a, b) => b[1].total - a[1].total
  )

  const quincenaRows = Object.entries(quincenaTotals).sort(
    (a, b) => b[1].total - a[1].total
  )

  const monthlyTotal = monthlyRows.reduce(
    (sum, [, value]) => sum + value.total,
    0
  )

  const quincenaTotal = quincenaRows.reduce(
    (sum, [, value]) => sum + value.total,
    0
  )

  const hasPendingImportReview =
    ledgerSummary.importReviewCandidates.length > 0 ||
    ledgerSummary.athReviewCandidates.length > 0

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">📊 Spending</h1>

      <Nav />

      {hasPendingImportReview && (
        <section className="border rounded p-4">
          Hay transacciones pendientes de revisión que todavía no están
          incluidas en este resumen.
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Gastos del mes</h2>
          <p className="text-sm opacity-70">
            Desde {startOfMonth} hasta {today}
          </p>
          <p className="text-4xl font-bold">{formatMoney(monthlyTotal)}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Gastos de la quincena</h2>
          <p className="text-sm opacity-70">
            Desde {startOfQuincena} hasta {today}
          </p>
          <p className="text-4xl font-bold">{formatMoney(quincenaTotal)}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Este mes por categoría</h2>

        {monthlyRows.map(([category, value]) => (
          <div key={category} className="border rounded p-4">
            <h3 className="text-xl font-bold">{category}</h3>
            <p>Total: {formatMoney(value.total)}</p>
            <p>Transacciones: {value.count}</p>

            <div className="mt-3 space-y-1">
              {entries
                .filter((entry) => entry.category === category)
                .slice(0, 10)
                .map((entry) => (
                  <div key={entry.id} className="text-sm border-t pt-1">
                    <span>{entry.date}</span>{' '}
                    <span>{entry.description}</span>{' '}
                    <strong>{formatMoney(entry.amount)}</strong>{' '}
                    <span className="opacity-60">({entry.source})</span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  )
}
