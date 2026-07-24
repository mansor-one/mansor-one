import {
  canonicalCategoryCodeForText,
  commonMerchantDefaultCategoryCode,
  getCategoryByCode,
} from './categories.ts'
import type { LedgerSummaryTransaction } from './ledger-summary.ts'
import { transactionStatusCountsTowardSpending } from './plaid-transaction-lifecycle.ts'

export const HOUSEHOLD_TIME_ZONE = 'America/Puerto_Rico'

export type SemiMonthlyPeriod = {
  year: number
  month: number
  startDate: string
  endDate: string
}

function zonedDateParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
  }
}

function dateOnly(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function currentSemiMonthlyPeriod(
  now: Date,
  timeZone = HOUSEHOLD_TIME_ZONE
): SemiMonthlyPeriod {
  const { year, month, day } = zonedDateParts(now, timeZone)
  const startsOn = day <= 15 ? 1 : 16
  const endsOn =
    day <= 15 ? 15 : new Date(Date.UTC(year, month, 0)).getUTCDate()

  return {
    year,
    month,
    startDate: dateOnly(year, month, startsOn),
    endDate: dateOnly(year, month, endsOn),
  }
}

function resolvedCategoryKind(transaction: LedgerSummaryTransaction) {
  const ledgerCode = canonicalCategoryCodeForText(transaction.category)
  const merchantCode = commonMerchantDefaultCategoryCode(
    transaction.description,
    { amount: transaction.amount }
  )
  const ledgerCategory = ledgerCode ? getCategoryByCode(ledgerCode) : null
  const merchantCategory = merchantCode ? getCategoryByCode(merchantCode) : null

  if (
    merchantCategory?.kind === 'expense' &&
    ledgerCategory &&
    ledgerCategory.kind !== 'expense'
  ) {
    return merchantCategory.kind
  }

  return (ledgerCategory || merchantCategory)?.kind || null
}

function isArchived(transaction: LedgerSummaryTransaction) {
  return (
    transaction.metadata.archived === true ||
    transaction.metadata.isArchived === true ||
    transaction.metadata.is_archived === true
  )
}

export function confirmedExpenseCountsInPeriod(
  transaction: LedgerSummaryTransaction,
  period: SemiMonthlyPeriod
) {
  if (
    transaction.sourceTable !== 'quick_entries' ||
    !transaction.date ||
    transaction.date < period.startDate ||
    transaction.date > period.endDate ||
    transaction.amount <= 0 ||
    isArchived(transaction)
  ) {
    return false
  }

  if (
    !transactionStatusCountsTowardSpending(
      transaction.metadata.plaidTransactionStatus as string | null,
      transaction.metadata.plaidPending === true
    )
  ) {
    return false
  }

  return resolvedCategoryKind(transaction) === 'expense'
}

export function calculateSemiMonthlySpending(
  transactions: LedgerSummaryTransaction[],
  now: Date,
  timeZone = HOUSEHOLD_TIME_ZONE
) {
  const period = currentSemiMonthlyPeriod(now, timeZone)
  const included = transactions.filter((transaction) =>
    confirmedExpenseCountsInPeriod(transaction, period)
  )

  return {
    period,
    included,
    amount: included.reduce(
      (sum, transaction) => sum + Number(transaction.amount || 0),
      0
    ),
  }
}
