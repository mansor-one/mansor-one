import { canonicalCategoryCodeForText, getCategoryByCode } from './categories.ts'
import type { LedgerSummaryTransaction } from './ledger-summary.ts'
import type { PortfolioSummary } from './types.ts'

export const REPORT_TIME_ZONE = 'America/Puerto_Rico'

export type MonthlyObligationRow = {
  id: string
  name: string
  amount: number
  dueDate: string
  status: string
}

export type MonthlyReport = {
  period: { month: string; startDate: string; endDate: string; label: string; isOpen: boolean }
  summary: {
    availableAtClose: number
    income: number
    confirmedExpenses: number
    payments: number
    totalDebt: number
    netWorth: number
  }
  cashFlow: { income: number; expenses: number; transfers: number; debtPayments: number; net: number }
  categories: Array<{ code: string; label: string; amount: number; count: number }>
  obligations: { paid: MonthlyObligationRow[]; pending: MonthlyObligationRow[]; overdue: MonthlyObligationRow[]; upcoming: MonthlyObligationRow[] }
  debt: Array<{ id: string; name: string; institution: string; openingBalance: number | null; payments: number; closingBalance: number; source: 'plaid' | 'manual'; isConnected: boolean }>
  bankAccounts: Array<{ id: string; name: string; institution: string; closingBalance: number; source: 'plaid' | 'manual'; isConnected: boolean; hasActivity: boolean }>
  relevantMovements: Array<{ id: string; date: string; description: string; amount: number; kind: 'large_purchase' | 'extraordinary_payment' | 'important_change'; label: string }>
  review: { pending: number }
  robototinaNotes: string[]
  currentRobototinaNotes: string[]
  dataQualityNotes: string[]
  disclosures: string[]
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export function parseReportMonth(value: string | null | undefined, now = new Date()) {
  const fallback = new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TIME_ZONE, year: 'numeric', month: '2-digit' }).format(now)
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(value || '') ? value as string : fallback
  const [year, monthNumber] = month.split('-').map(Number)
  const endDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const currentMonth = fallback
  return {
    month,
    startDate: `${month}-01`,
    endDate: `${month}-${String(endDay).padStart(2, '0')}`,
    label: `${MONTHS[monthNumber - 1]} ${year}`,
    isOpen: month >= currentMonth,
  }
}

function amount(transaction: LedgerSummaryTransaction) {
  return Math.abs(Number(transaction.amount || 0))
}

function reportKind(transaction: LedgerSummaryTransaction) {
  const code = canonicalCategoryCodeForText(transaction.category)
  const category = code ? getCategoryByCode(code) : null
  if (category?.kind === 'income') return 'income'
  if (category?.kind === 'transfer') return 'transfer'
  if (category?.kind === 'payment') return 'payment'
  const entryType = String(transaction.metadata.entryType || '').toLowerCase()
  if (['income', 'deposit', 'refund', 'credit'].includes(entryType)) return 'income'
  if (entryType.includes('transfer')) return 'transfer'
  if (entryType === 'payment' || entryType === 'debt_payment') return 'payment'
  return 'expense'
}

function institution(transaction: LedgerSummaryTransaction) {
  const value = transaction.metadata.institutionName
  return typeof value === 'string' && value.trim() ? value.trim() : 'Sin institución'
}

function normalizedIdentity(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function accountHasActivity(
  account: PortfolioSummary['liquidAssets'][number],
  transactions: LedgerSummaryTransaction[]
) {
  const sourceId = normalizedIdentity(account.sourceId)
  const accountName = normalizedIdentity(account.name)
  const institutionName = normalizedIdentity(account.institution)

  return transactions.some((transaction) => {
    const transactionAccountId = normalizedIdentity(
      typeof transaction.metadata.plaidAccountId === 'string'
        ? transaction.metadata.plaidAccountId
        : null
    )
    if (sourceId && transactionAccountId && sourceId === transactionAccountId) return true

    const transactionAccountName = normalizedIdentity(
      typeof transaction.metadata.accountName === 'string'
        ? transaction.metadata.accountName
        : null
    )
    const transactionInstitution = normalizedIdentity(
      typeof transaction.metadata.institutionName === 'string'
        ? transaction.metadata.institutionName
        : null
    )
    return Boolean(
      accountName && transactionAccountName && accountName === transactionAccountName &&
      (!institutionName || !transactionInstitution || institutionName === transactionInstitution)
    )
  })
}

function possibleDuplicateNotes(
  obligations: MonthlyObligationRow[],
  liabilities: PortfolioSummary['liabilities']
) {
  const notes: string[] = []
  const obligationGroups = new Map<string, MonthlyObligationRow[]>()
  for (const row of obligations) {
    const key = `${normalizedIdentity(row.name)}:${row.dueDate}:${Number(row.amount).toFixed(2)}`
    const current = obligationGroups.get(key) || []
    current.push(row)
    obligationGroups.set(key, current)
  }
  for (const rows of obligationGroups.values()) {
    if (rows.length > 1) {
      notes.push(`Posible duplicidad legacy: ${rows.length} registros de ${rows[0].name} comparten fecha e importe. No se consolidaron.`)
    }
  }

  for (let index = 0; index < liabilities.length; index += 1) {
    for (let candidate = index + 1; candidate < liabilities.length; candidate += 1) {
      const left = liabilities[index]
      const right = liabilities[candidate]
      const leftName = normalizedIdentity(left.name)
      const leftInstitution = normalizedIdentity(left.institution)
      if (
        leftName && leftInstitution &&
        left.source !== right.source &&
        leftName === normalizedIdentity(right.name) &&
        leftInstitution === normalizedIdentity(right.institution)
      ) {
        notes.push(`Posible duplicidad Plaid/manual: ${left.name || 'Deuda'} aparece en ambas fuentes. Se muestran por separado.`)
      }
    }
  }
  return [...new Set(notes)]
}

function obligationBucket(row: MonthlyObligationRow, today: string) {
  const status = row.status.toLowerCase()
  if (['paid', 'confirmed', 'closed', 'reconciled'].includes(status)) return 'paid'
  if (row.dueDate < today) return 'overdue'
  if (row.dueDate <= today) return 'pending'
  return 'upcoming'
}

export function buildMonthlyReport({
  month,
  transactions,
  obligations,
  portfolio,
  pendingReviewCount,
  robototinaInsights = [],
  now = new Date(),
}: {
  month: string
  transactions: LedgerSummaryTransaction[]
  obligations: MonthlyObligationRow[]
  portfolio: PortfolioSummary
  pendingReviewCount: number
  robototinaInsights?: Array<{ title: string; message: string }>
  now?: Date
}): MonthlyReport {
  const period = parseReportMonth(month, now)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TIME_ZONE }).format(now)
  const rows = transactions.filter((row) => row.date && row.date >= period.startDate && row.date <= period.endDate)
  const byKind = { income: 0, expense: 0, transfer: 0, payment: 0 }
  const categoryMap = new Map<string, { code: string; label: string; amount: number; count: number }>()

  rows.forEach((row) => {
    const kind = reportKind(row)
    byKind[kind] += amount(row)
    if (kind !== 'expense') return
    const code = canonicalCategoryCodeForText(row.category) || 'uncategorized'
    const label = getCategoryByCode(code)?.displayName || row.category || 'Sin categoría'
    const current = categoryMap.get(code) || { code, label, amount: 0, count: 0 }
    current.amount += amount(row)
    current.count += 1
    categoryMap.set(code, current)
  })

  const obligationGroups: MonthlyReport['obligations'] = { paid: [], pending: [], overdue: [], upcoming: [] }
  obligations.forEach((row) => obligationGroups[obligationBucket(row, today)].push(row))

  const paymentsByInstitution = new Map<string, number>()
  rows.filter((row) => reportKind(row) === 'payment').forEach((row) => {
    const label = institution(row)
    paymentsByInstitution.set(label, (paymentsByInstitution.get(label) || 0) + amount(row))
  })

  const expenses = rows.filter((row) => reportKind(row) === 'expense').sort((a, b) => amount(b) - amount(a))
  const averageExpense = expenses.length ? byKind.expense / expenses.length : 0
  const largeThreshold = Math.max(100, averageExpense * 2)
  const relevantMovements: MonthlyReport['relevantMovements'] = [
    ...expenses.filter((row) => amount(row) >= largeThreshold).slice(0, 5).map((row) => ({ id: row.id, date: row.date!, description: row.description || 'Movimiento', amount: amount(row), kind: 'large_purchase' as const, label: 'Compra grande' })),
    ...rows.filter((row) => reportKind(row) === 'payment').sort((a, b) => amount(b) - amount(a)).slice(0, 3).map((row) => ({ id: row.id, date: row.date!, description: row.description || 'Pago', amount: amount(row), kind: 'extraordinary_payment' as const, label: 'Pago de deuda' })),
  ].slice(0, 8)

  const categories = [...categoryMap.values()].sort((a, b) => b.amount - a.amount)
  const robototinaNotes = [
    categories[0] ? `${categories[0].label} fue la categoría de mayor gasto, con $${categories[0].amount.toFixed(2)}.` : 'No hay gastos confirmados categorizados en este período.',
    byKind.income >= byKind.expense ? 'Los ingresos confirmados cubren los gastos confirmados del período.' : 'Los gastos confirmados superan los ingresos confirmados del período.',
    obligations.length > 0
      ? `${obligations.length} obligación(es) corresponden al período seleccionado.`
      : 'No hay obligaciones registradas para el período seleccionado.',
  ]
  const currentRobototinaNotes = robototinaInsights
    .map((item) => `${item.title}: ${item.message}`)
    .slice(0, 5)
  const dataQualityNotes = [
    pendingReviewCount > 0
      ? `${pendingReviewCount} movimiento(s) siguen pendientes en Review Queue y no alteran los totales confirmados.`
      : 'No hay movimientos pendientes en Review Queue.',
    ...possibleDuplicateNotes(obligations, portfolio.liabilities),
  ]
  const disclosures = [
    period.isOpen ? `El mes está abierto; los importes y estados son provisionales al ${today}.` : 'Los movimientos del período provienen exclusivamente del ledger confirmado.',
    'Balances, deuda y net worth usan el snapshot financiero actual porque Mansor One todavía no conserva snapshots mensuales históricos.',
    'Transferencias internas y pagos de deuda se presentan separados de ingresos y gastos para evitar doble conteo.',
  ]

  return {
    period,
    summary: { availableAtClose: portfolio.totalLiquidAvailable, income: byKind.income, confirmedExpenses: byKind.expense, payments: byKind.payment, totalDebt: portfolio.totalLiabilities, netWorth: portfolio.netWorth },
    cashFlow: { income: byKind.income, expenses: byKind.expense, transfers: byKind.transfer, debtPayments: byKind.payment, net: byKind.income - byKind.expense - byKind.payment },
    categories,
    obligations: obligationGroups,
    debt: portfolio.liabilities.map((item) => ({ id: item.id, name: item.name || 'Deuda', institution: item.institution || 'Manual', openingBalance: null, payments: paymentsByInstitution.get(item.institution || 'Manual') || 0, closingBalance: item.balance, source: item.source, isConnected: item.isConnected })),
    bankAccounts: portfolio.liquidAssets.map((item) => ({ id: item.id, name: item.name || 'Cuenta', institution: item.institution || (item.isManual ? 'Manual' : 'Sin institución'), closingBalance: item.balance, source: item.source, isConnected: item.isConnected, hasActivity: accountHasActivity(item, rows) })),
    relevantMovements,
    review: { pending: pendingReviewCount },
    robototinaNotes,
    currentRobototinaNotes,
    dataQualityNotes,
    disclosures,
  }
}
