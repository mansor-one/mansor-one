import {
  DEFAULT_PLANNING_HORIZON_DAYS,
  addDays,
  generateExpectedIncomeInstances,
  resolveTrustedPayments,
  threePaycheckMonths,
  type PaymentTruthStatus,
  type TrustedPayment,
} from './payment-truth.ts'
import type { FinancialSupabaseClient, LiquiditySummary } from './types.ts'

export type TimelineHorizonDays = 30 | 45 | 90 | 365

export type TimelineProjectionEvent = {
  id: string
  date: string
  title: string
  amount: number
  type: 'income' | 'payment'
  status: PaymentTruthStatus | 'projected_income' | 'confirmed_income' | string
  notes: string
  dueDate: string
  graceUntilDate: string | null
  isInGracePeriod: boolean
  balanceAfter: number
  sourceOfTruth: string
  matchingInformation: string | null
  availableAction: string
}

export type TimelineProjectionSummary = {
  asOfDate: string
  horizonDays: number
  horizonEnd: string
  startingCash: number
  finalBalance: number
  minimumBalance: number
  events: TimelineProjectionEvent[]
  sections: {
    needsAttention: TimelineProjectionEvent[]
    upcoming: TimelineProjectionEvent[]
    possibleMatches: TimelineProjectionEvent[]
    paidOrReconciled: TrustedPayment[]
    later: TrustedPayment[]
  }
  paymentCounts: Record<PaymentTruthStatus, number>
  expectedIncomeTotal: number
  actionablePaymentTotal: number
  paidOrMatchedTotal: number
  threePaycheckMonths: Array<{ owner: string; month: string; count: number }>
  diagnostics: {
    paymentInstancesEvaluated: number
    matchedPayments: number
    possibleMatches: number
    manuallyPaidPayments: number
    overduePayments: number
    futurePaymentsExcluded: number
    duplicateRecordsExcluded: number
    incomeInstancesLoaded: number
    incompleteIncomeSchedules: number
    reconciliationErrors: number
  }
  explanation: {
    initialCash: { balance: number; connectedCash: number; manualCash: number; text: string }
    lowestPoint: { date: string | null; balance: number; payments: TimelineProjectionEvent[]; incomeEvents: TimelineProjectionEvent[]; text: string }
    finalBalance: { balance: number; totalIncome: number; totalPayments: number; openCommitmentsCount: number; incomeEventsCount: number; text: string }
  }
}

const paymentStatuses: PaymentTruthStatus[] = [
  'paid', 'matched', 'possible_match', 'unpaid', 'due_soon', 'due_today',
  'grace_period', 'overdue', 'needs_review', 'incomplete', 'future',
]

export function buildTimelineProjectionFromLiquidity(
  liquidity: Pick<LiquiditySummary, 'cashAvailableTotal' | 'cashAvailablePlaid' | 'cashAvailableManual' | 'income' | 'lifecyclePayments'>,
  options: { today?: string; horizonDays?: number } = {}
): TimelineProjectionSummary {
  const today = options.today || new Date().toISOString().slice(0, 10)
  const horizonDays = options.horizonDays || DEFAULT_PLANNING_HORIZON_DAYS
  const horizonEnd = addDays(today, horizonDays)
  const trustedPayments = resolveTrustedPayments({ payments: liquidity.lifecyclePayments || [], today, horizonDays })
  const income = generateExpectedIncomeInstances({ schedules: liquidity.income.allIncome || [], start: today, end: horizonEnd })
  const projectedPayments = trustedPayments.filter((payment) =>
    ['unpaid', 'due_soon', 'due_today', 'grace_period', 'overdue'].includes(payment.truthStatus)
  )
  const rawEvents = [
    ...income.instances.map((item) => ({
      id: item.id, date: item.date, title: item.name, amount: item.amount,
      type: 'income' as const,
      status: item.projected ? 'projected_income' as const : 'confirmed_income' as const,
      notes: `${item.owner} · ${item.confidence}`,
      dueDate: item.date, graceUntilDate: null, isInGracePeriod: false,
      sourceOfTruth: 'income schedule occurrence', matchingInformation: null,
      availableAction: 'Review income schedule',
    })),
    ...projectedPayments.map((payment) => ({
      id: payment.id,
      date: payment.grace_until || payment.grace_due_date || payment.effective_due_date || payment.due_date || payment.expected_date || today,
      title: payment.name || 'Payment', amount: -Number(payment.amount || 0), type: 'payment' as const,
      status: payment.truthStatus,
      notes: payment.truthReasons.join(' '),
      dueDate: payment.due_date || payment.expected_date || payment.effective_due_date || today,
      graceUntilDate: payment.grace_until || payment.grace_due_date || payment.effective_due_date || null,
      isInGracePeriod: payment.truthStatus === 'grace_period', sourceOfTruth: payment.sourceOfTruth,
      matchingInformation: payment.lifecycleMatchedTransaction
        ? `${payment.lifecycleMatchedTransaction.name || 'Transaction'} · ${payment.lifecycleMatchedTransaction.confidence}%`
        : null,
      availableAction: payment.availableAction,
    })),
  ].sort((left, right) => left.date.localeCompare(right.date) || right.amount - left.amount)

  let balance = liquidity.cashAvailableTotal
  const events = rawEvents.map((event) => ({ ...event, balanceAfter: (balance += event.amount) }))
  const lowest = events.reduce<TimelineProjectionEvent | null>((current, event) =>
    !current || event.balanceAfter < current.balanceAfter ? event : current, null)
  const lowestDate = lowest?.date || null
  const counts = Object.fromEntries(paymentStatuses.map((status) => [status, trustedPayments.filter((payment) => payment.truthStatus === status).length])) as Record<PaymentTruthStatus, number>
  const reviewEvents = trustedPayments
    .filter((payment) => ['needs_review', 'incomplete'].includes(payment.truthStatus))
    .map((payment) => ({
      id: payment.id,
      date: payment.due_date || payment.expected_date || today,
      title: payment.name || 'Payment',
      amount: -Number(payment.amount || 0),
      type: 'payment' as const,
      status: payment.truthStatus,
      notes: payment.truthReasons.join(' '),
      dueDate: payment.due_date || payment.expected_date || today,
      graceUntilDate: payment.grace_until || null,
      isInGracePeriod: false,
      balanceAfter: liquidity.cashAvailableTotal,
      sourceOfTruth: payment.sourceOfTruth,
      matchingInformation: null,
      availableAction: payment.availableAction,
    }))
  const needsAttention = [
    ...events.filter((event) => event.type === 'payment' && ['overdue', 'due_today', 'grace_period'].includes(event.status)),
    ...reviewEvents,
  ]
  const possibleMatches = trustedPayments.filter((payment) => payment.truthStatus === 'possible_match').map((payment) => ({
    id: payment.id, date: payment.due_date || payment.expected_date || today, title: payment.name || 'Payment', amount: -Number(payment.amount || 0), type: 'payment' as const,
    status: payment.truthStatus, notes: payment.truthReasons.join(' '), dueDate: payment.due_date || payment.expected_date || today,
    graceUntilDate: payment.grace_until || null, isInGracePeriod: false, balanceAfter: balance,
    sourceOfTruth: payment.sourceOfTruth,
    matchingInformation: payment.lifecycleMatchedTransaction ? `${payment.lifecycleMatchedTransaction.name || 'Transaction'} · ${payment.lifecycleMatchedTransaction.confidence}%` : null,
    availableAction: payment.availableAction,
  }))
  const totalIncome = income.instances.reduce((sum, item) => sum + item.amount, 0)
  const totalPayments = projectedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

  return {
    asOfDate: today, horizonDays, horizonEnd, startingCash: liquidity.cashAvailableTotal,
    finalBalance: balance, minimumBalance: lowest?.balanceAfter ?? liquidity.cashAvailableTotal, events,
    sections: {
      needsAttention,
      upcoming: events.filter((event) => event.type === 'income' || ['unpaid', 'due_soon'].includes(event.status)),
      possibleMatches,
      paidOrReconciled: trustedPayments.filter((payment) => ['paid', 'matched'].includes(payment.truthStatus)),
      later: trustedPayments.filter((payment) => payment.truthStatus === 'future'),
    },
    paymentCounts: counts, expectedIncomeTotal: totalIncome,
    actionablePaymentTotal: trustedPayments.filter((payment) => payment.actionable).reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    paidOrMatchedTotal: trustedPayments.filter((payment) => ['paid', 'matched'].includes(payment.truthStatus)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    threePaycheckMonths: threePaycheckMonths(income.instances),
    diagnostics: {
      paymentInstancesEvaluated: trustedPayments.length, matchedPayments: counts.matched,
      possibleMatches: counts.possible_match, manuallyPaidPayments: counts.paid,
      overduePayments: counts.overdue, futurePaymentsExcluded: counts.future,
      duplicateRecordsExcluded: trustedPayments.filter((payment) => payment.duplicate).length,
      incomeInstancesLoaded: income.instances.length, incompleteIncomeSchedules: income.incompleteSchedules.length,
      reconciliationErrors: 0,
    },
    explanation: {
      initialCash: { balance: liquidity.cashAvailableTotal, connectedCash: liquidity.cashAvailablePlaid, manualCash: liquidity.cashAvailableManual, text: 'Starts from Financial Engine usable cash, not raw bank balance.' },
      lowestPoint: { date: lowestDate, balance: lowest?.balanceAfter ?? liquidity.cashAvailableTotal, payments: events.filter((event) => event.date === lowestDate && event.type === 'payment'), incomeEvents: events.filter((event) => event.date === lowestDate && event.type === 'income'), text: lowestDate ? `Lowest point inside the active ${horizonDays}-day horizon.` : 'No projected events are loaded inside the active horizon.' },
      finalBalance: { balance, totalIncome, totalPayments, openCommitmentsCount: projectedPayments.length, incomeEventsCount: income.instances.length, text: 'Initial usable cash plus generated expected income, minus only unpaid actionable commitments inside the active horizon.' },
    },
  }
}

export async function getTimelineProjection(supabase: FinancialSupabaseClient, userId: string, options: { horizonDays?: number; today?: string } = {}) {
  const { getDashboardSummary } = await import('./dashboard.ts')
  const { liquidity } = await getDashboardSummary(supabase, userId)
  return buildTimelineProjectionFromLiquidity(liquidity, options)
}
