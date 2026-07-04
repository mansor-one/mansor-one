import type { IncomePlanningSummary, IncomeSchedule } from './types'

export const INCOME_STATUSES = [
  'expected',
  'received',
  'missed',
  'cancelled',
] as const

export type IncomeStatus = (typeof INCOME_STATUSES)[number]

function startOfDay(date: Date) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function incomeDate(income: IncomeSchedule) {
  if (!income.next_expected_date) return null
  return new Date(`${income.next_expected_date}T00:00:00`)
}

export function incomeStatus(income: IncomeSchedule): IncomeStatus {
  if (income.status && INCOME_STATUSES.includes(income.status as IncomeStatus)) {
    return income.status as IncomeStatus
  }

  if (income.received_at) return 'received'
  if (income.is_active === false) return 'cancelled'

  return 'expected'
}

function byExpectedDate(left: IncomeSchedule, right: IncomeSchedule) {
  return String(left.next_expected_date || '').localeCompare(
    String(right.next_expected_date || '')
  )
}

export function buildIncomePlanningSummary(
  incomeRows: IncomeSchedule[],
  asOf = new Date()
): IncomePlanningSummary {
  const today = startOfDay(asOf)
  const expectedIncome = incomeRows
    .filter((income) => incomeStatus(income) === 'expected')
    .sort(byExpectedDate)
  const receivedIncome = incomeRows
    .filter((income) => incomeStatus(income) === 'received')
    .sort(byExpectedDate)
  const missedIncome = incomeRows
    .filter((income) => incomeStatus(income) === 'missed')
    .sort(byExpectedDate)
  const cancelledIncome = incomeRows
    .filter((income) => incomeStatus(income) === 'cancelled')
    .sort(byExpectedDate)
  const projectedIncome = expectedIncome.filter((income) => {
    if (!income.amount || !income.next_expected_date) return false
    const date = incomeDate(income)
    return Boolean(date && date >= today)
  })
  const totalProjectedIncome = projectedIncome.reduce(
    (sum, income) => sum + Number(income.amount || 0),
    0
  )

  return {
    allIncome: incomeRows,
    expectedIncome,
    receivedIncome,
    missedIncome,
    cancelledIncome,
    projectedIncome,
    totalProjectedIncome,
  }
}
