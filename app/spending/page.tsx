import { requireUser } from '@/lib/auth/requireUser'
import {
  canonicalCategoryCodeForText,
  commonMerchantDefaultCategoryCode,
  getCategoryByCode,
  type LedgerSummaryTransaction,
  getLedgerSummary,
  transactionContext,
  type TransactionContext,
} from '@/lib/financial-engine'
import Link from 'next/link'
import type { Metadata } from 'next'
import Nav from '../components/Nav'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Gastos | Mansor One',
}

type PageProps = {
  searchParams?: Promise<{
    month?: string
    year?: string
  }>
}

type SpendingPeriod = {
  mode: 'monthly'
  year: number
  month: number
  startDate: string
  endDate: string
  quincenaStartDate: string
  label: string
}

type SpendingEntry = {
  id: string
  date: string
  description: string
  categoryCode: string | null
  category: string
  amount: number
  sourceTable: LedgerSummaryTransaction['sourceTable']
  plaidTransactionId: string | null
  context: TransactionContext
}

const monthNames = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString()}`
}

function dateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function boundedNumber(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed)) return fallback

  return Math.min(Math.max(parsed, min), max)
}

function periodLink(year: number, month: number) {
  return `/spending?year=${year}&month=${month}`
}

function adjacentMonth(year: number, month: number, offset: number) {
  const date = new Date(year, month - 1 + offset, 1)

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  }
}

function selectedPeriod(
  params: Awaited<PageProps['searchParams']>
): SpendingPeriod {
  const now = new Date()
  const selectedYear = boundedNumber(
    params?.year,
    now.getFullYear(),
    now.getFullYear() - 5,
    now.getFullYear() + 1
  )
  const selectedMonth = boundedNumber(
    params?.month,
    now.getMonth() + 1,
    1,
    12
  )
  const startDate = new Date(selectedYear, selectedMonth - 1, 1)
  const endOfMonth = new Date(selectedYear, selectedMonth, 0)
  const isCurrentMonth =
    selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1
  const reportEndDate = isCurrentMonth ? now : endOfMonth
  const quincenaStartDay = isCurrentMonth && now.getDate() > 15 ? 16 : 1
  const quincenaStartDate = new Date(
    selectedYear,
    selectedMonth - 1,
    quincenaStartDay
  )

  return {
    mode: 'monthly',
    year: selectedYear,
    month: selectedMonth,
    startDate: dateString(startDate),
    endDate: dateString(reportEndDate),
    quincenaStartDate: dateString(quincenaStartDate),
    label: `${monthNames[selectedMonth - 1]} ${selectedYear}`,
  }
}

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

function displayCategory(categoryCode: string | null) {
  const category = categoryFromCode(categoryCode)

  return category?.displayName || 'Pending Review'
}

function spendingEntry(
  transaction: LedgerSummaryTransaction
): SpendingEntry | null {
  if (!transaction.date) return null

  const categoryCode = resolvedCategoryCode(transaction)

  return {
    id: `${transaction.sourceTable}-${transaction.id}`,
    date: transaction.date,
    description: transaction.description || 'Movimiento registrado',
    categoryCode,
    category: displayCategory(categoryCode),
    amount: Number(transaction.amount || 0),
    sourceTable: transaction.sourceTable,
    plaidTransactionId: transaction.plaidTransactionId,
    context: transactionContext(transaction),
  }
}

function hasKnownValue(value: string | null | undefined) {
  return Boolean(value && value !== 'Unknown')
}

function displayInstitution(context: TransactionContext) {
  return hasKnownValue(context.institution)
    ? context.institution
    : 'Institución no identificada'
}

function displayAccount(context: TransactionContext) {
  if (hasKnownValue(context.accountLabel)) return context.accountLabel

  if (context.accountMask) {
    return `Cuenta no identificada ••••${context.accountMask}`
  }

  return 'Cuenta no identificada'
}

function displayPaymentMethod(context: TransactionContext) {
  return hasKnownValue(context.paymentMethod)
    ? context.paymentMethod
    : 'Método no identificado'
}

function contextRichnessScore(context: TransactionContext) {
  let score = 0

  if (hasKnownValue(context.institution)) score += 4
  if (hasKnownValue(context.accountName)) score += 4
  if (hasKnownValue(context.accountMask)) score += 2
  if (hasKnownValue(context.paymentMethod)) score += 3
  if (hasKnownValue(context.accountOwner)) score += 1
  if (hasKnownValue(context.source)) score += 1

  return score
}

function observationRank(entry: SpendingEntry) {
  if (entry.sourceTable === 'quick_entries') return 300

  return contextRichnessScore(entry.context) > 0 ? 200 : 100
}

function entryQualityScore(entry: SpendingEntry) {
  return observationRank(entry) + contextRichnessScore(entry.context)
}

function baseLogicalTransactionKey(entry: SpendingEntry) {
  if (entry.plaidTransactionId) {
    return `plaid:${entry.plaidTransactionId}`
  }

  const amountInCents = Math.round(Math.abs(entry.amount) * 100)

  return [
    'logical',
    entry.context.normalizedMerchant || entry.description,
    entry.date,
    amountInCents,
    entry.categoryCode || 'pending-review',
  ].join(':')
}

function dedupeLogicalEntries(entries: SpendingEntry[]) {
  const groupedByBaseKey = new Map<string, SpendingEntry[]>()

  entries.forEach((entry) => {
    const key = baseLogicalTransactionKey(entry)
    const group = groupedByBaseKey.get(key) || []

    group.push(entry)
    groupedByBaseKey.set(key, group)
  })

  const dedupedEntries = [...groupedByBaseKey.values()].flatMap((group) => {
    const knownInstitutions = new Set(
      group
        .map((entry) => entry.context.institution)
        .filter((institution) => hasKnownValue(institution))
    )

    if (knownInstitutions.size <= 1) {
      return [
        group.reduce((best, entry) =>
          entryQualityScore(entry) > entryQualityScore(best) ? entry : best
        ),
      ]
    }

    const byInstitution = new Map<string, SpendingEntry>()

    group.forEach((entry) => {
      const institution = hasKnownValue(entry.context.institution)
        ? entry.context.institution
        : 'Unknown'
      const current = byInstitution.get(institution)

      if (!current || entryQualityScore(entry) > entryQualityScore(current)) {
        byInstitution.set(institution, entry)
      }
    })

    return [...byInstitution.values()]
  })

  return dedupedEntries.sort((a, b) =>
    b.date.localeCompare(a.date)
  )
}

export default async function SpendingPage({ searchParams }: PageProps) {
  const { supabase, user } = await requireUser()
  const params = await searchParams
  const period = selectedPeriod(params)
  const previousMonth = adjacentMonth(period.year, period.month, -1)
  const nextMonth = adjacentMonth(period.year, period.month, 1)
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from(
    { length: 7 },
    (_, index) => currentYear - 5 + index
  )

  const ledgerSummary = await getLedgerSummary(supabase, user.id)

  // Spending uses confirmed ledger only. Plaid import candidates are excluded
  // until promoted into quick_entries.
  // TODO: ATH/Gmail enrichment belongs in Review Queue and History detail,
  // not in this monthly spending summary.
  const displayEntries = dedupeLogicalEntries(
    ledgerSummary.confirmedLedgerEntries
      .filter(
        (transaction) =>
          transaction.date &&
          transaction.date >= period.startDate &&
          transaction.date <= period.endDate
      )
      .map(spendingEntry)
      .filter((entry): entry is SpendingEntry => entry !== null)
      .filter((entry) => entry.amount > 0)
  )
  const entries = displayEntries.filter((entry) => {
    const category = categoryFromCode(entry.categoryCode)

    return category?.kind === 'expense'
  })
  const pendingReviewEntries = displayEntries.filter(
    (entry) => !entry.categoryCode
  )
  const nonSpendingEntries = displayEntries.filter((entry) => {
    const category = categoryFromCode(entry.categoryCode)

    return Boolean(category && category.kind !== 'expense')
  })

  const monthlyTotals: Record<string, { total: number; count: number }> = {}
  const quincenaTotals: Record<string, { total: number; count: number }> = {}

  entries.forEach((entry) => {
    const category = entry.category || 'Sin categoría'

    if (!monthlyTotals[category]) {
      monthlyTotals[category] = { total: 0, count: 0 }
    }

    monthlyTotals[category].total += entry.amount
    monthlyTotals[category].count += 1

    if (entry.date >= period.quincenaStartDate) {
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

      <section className="border rounded p-4 space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold">{period.label}</h2>
            <p className="text-sm opacity-70">
              Desde {period.startDate} hasta {period.endDate}
            </p>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Link
              className="border rounded px-3 py-2 text-center"
              href={periodLink(previousMonth.year, previousMonth.month)}
            >
              Mes anterior
            </Link>

            <form className="flex flex-col gap-2 sm:flex-row" method="get">
              <select
                className="border rounded px-3 py-2"
                defaultValue={period.month}
                name="month"
              >
                {monthNames.map((monthName, index) => (
                  <option key={monthName} value={index + 1}>
                    {monthName}
                  </option>
                ))}
              </select>

              <select
                className="border rounded px-3 py-2"
                defaultValue={period.year}
                name="year"
              >
                {yearOptions.map((yearOption) => (
                  <option key={yearOption} value={yearOption}>
                    {yearOption}
                  </option>
                ))}
              </select>

              <button className="border rounded px-4 py-2" type="submit">
                Ver
              </button>
            </form>

            <Link
              className="border rounded px-3 py-2 text-center"
              href={periodLink(nextMonth.year, nextMonth.month)}
            >
              Mes siguiente
            </Link>
          </div>
        </div>
      </section>

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
            Desde {period.startDate} hasta {period.endDate}
          </p>
          <p className="text-4xl font-bold">{formatMoney(monthlyTotal)}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Gastos de la quincena</h2>
          <p className="text-sm opacity-70">
            Desde {period.quincenaStartDate} hasta {period.endDate}
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
                    <div className="grid grid-cols-1 gap-1 md:grid-cols-7 md:items-center">
                      <span>{entry.date}</span>
                      <span className="font-medium">
                        {entry.context.normalizedMerchant}
                      </span>
                      <strong>{formatMoney(entry.amount)}</strong>
                      <span>{entry.category}</span>
                      <span>{displayInstitution(entry.context)}</span>
                      <span>{displayAccount(entry.context)}</span>
                      <span>{displayPaymentMethod(entry.context)}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </section>

      {nonSpendingEntries.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-2xl font-bold">Non-Spending Movements</h2>
            <p className="text-sm opacity-70">
              Payments, transfers, income, deposits, and refunds are separated
              from Spending totals.
            </p>
          </div>

          <div className="border rounded p-4">
            <p>Transacciones: {nonSpendingEntries.length}</p>

            <div className="mt-3 space-y-1">
              {nonSpendingEntries.slice(0, 10).map((entry) => (
                <div key={entry.id} className="text-sm border-t pt-1">
                  <div className="grid grid-cols-1 gap-1 md:grid-cols-7 md:items-center">
                    <span>{entry.date}</span>
                    <span className="font-medium">
                      {entry.context.normalizedMerchant}
                    </span>
                    <strong>{formatMoney(entry.amount)}</strong>
                    <span>{entry.category}</span>
                    <span>{displayInstitution(entry.context)}</span>
                    <span>{displayAccount(entry.context)}</span>
                    <span>{displayPaymentMethod(entry.context)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {pendingReviewEntries.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-2xl font-bold">Pending Review</h2>
            <p className="text-sm opacity-70">
              These transactions need a category before they count toward
              Spending totals.
            </p>
          </div>

          <div className="border rounded p-4">
            <p>Transacciones: {pendingReviewEntries.length}</p>

            <div className="mt-3 space-y-1">
              {pendingReviewEntries.slice(0, 10).map((entry) => (
                <div key={entry.id} className="text-sm border-t pt-1">
                  <div className="grid grid-cols-1 gap-1 md:grid-cols-6 md:items-center">
                    <span>{entry.date}</span>
                    <span className="font-medium">
                      {entry.context.normalizedMerchant}
                    </span>
                    <strong>{formatMoney(entry.amount)}</strong>
                    <span>{displayInstitution(entry.context)}</span>
                    <span>{displayAccount(entry.context)}</span>
                    <span>{displayPaymentMethod(entry.context)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
