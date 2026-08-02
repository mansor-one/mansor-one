import {
  DEFAULT_PLANNING_HORIZON_DAYS,
  addDays,
  generateExpectedIncomeInstances,
  resolveTrustedPayments,
  threePaycheckMonths,
  type PaymentTruthStatus,
  type TrustedPayment,
} from './payment-truth.ts'
import {
  DEFAULT_HOUSEHOLD_TIME_ZONE,
  dateInTimeZone,
} from './recurring-cycle-enumerator.ts'
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
  matchConfidence?: number | null
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
  trustedPayments: TrustedPayment[]
  sections: {
    needsAttention: TimelineProjectionEvent[]
    upcoming: TimelineProjectionEvent[]
    possibleMatches: TimelineProjectionEvent[]
    paidOrReconciled: TrustedPayment[]
    later: TrustedPayment[]
    inTransit: TrustedPayment[]
  }
  paymentCounts: Record<PaymentTruthStatus, number>
  expectedIncomeTotal: number
  actionablePaymentTotal: number
  openObligationTotal: number
  inTransitPaymentTotal: number
  reconciledRecentlyTotal: number
  adjustedRiskTotal: number
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
    income: {
      configuredCount: number
      considered: Array<{ scheduleId: string; name: string; amount: number; cadence: string; nextExpectedDate: string | null; occurrenceCount: number; reason: string }>
      excluded: Array<{ scheduleId: string; name: string; amount: number; cadence: string; nextExpectedDate: string | null; occurrenceCount: number; reason: string }>
      text: string
    }
  }
}

const paymentStatuses: PaymentTruthStatus[] = [
  'paid', 'matched', 'possible_match', 'in_transit', 'unpaid', 'due_soon', 'due_today',
  'grace_period', 'overdue', 'needs_review', 'incomplete', 'future',
]

export function buildTimelineProjectionFromLiquidity(
  liquidity: Pick<LiquiditySummary, 'cashAvailableTotal' | 'cashAvailablePlaid' | 'cashAvailableManual' | 'income' | 'lifecyclePayments'>,
  options: { today?: string; horizonDays?: number } = {}
): TimelineProjectionSummary {
  const today =
    options.today || dateInTimeZone(new Date(), DEFAULT_HOUSEHOLD_TIME_ZONE)
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
      sourceOfTruth: 'ocurrencia del calendario de ingresos', matchingInformation: null,
      matchConfidence: null, availableAction: 'Revisar calendario de ingresos',
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
      matchConfidence: payment.lifecycleMatchedTransaction?.confidence ?? null,
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
      matchConfidence: payment.lifecycleMatchedTransaction?.confidence ?? null,
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
    matchConfidence: payment.lifecycleMatchedTransaction?.confidence ?? null,
    availableAction: payment.availableAction,
  }))
  const totalIncome = income.instances.reduce((sum, item) => sum + item.amount, 0)
  const totalPayments = projectedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

  return {
    asOfDate: today, horizonDays, horizonEnd, startingCash: liquidity.cashAvailableTotal,
    finalBalance: balance, minimumBalance: lowest?.balanceAfter ?? liquidity.cashAvailableTotal, events, trustedPayments,
    sections: {
      needsAttention,
      upcoming: events.filter((event) => event.type === 'income' || ['unpaid', 'due_soon'].includes(event.status)),
      possibleMatches,
      paidOrReconciled: trustedPayments.filter((payment) => ['paid', 'matched'].includes(payment.truthStatus)),
      later: trustedPayments.filter((payment) => payment.truthStatus === 'future'),
      inTransit: trustedPayments.filter((payment) => payment.truthStatus === 'in_transit'),
    },
    paymentCounts: counts, expectedIncomeTotal: totalIncome,
    openObligationTotal: trustedPayments.filter((payment) => ['possible_match', 'unpaid', 'due_soon', 'due_today', 'grace_period', 'overdue', 'needs_review'].includes(payment.truthStatus)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    inTransitPaymentTotal: trustedPayments.filter((payment) => payment.truthStatus === 'in_transit').reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    reconciledRecentlyTotal: trustedPayments.filter((payment) =>
      ['paid', 'matched'].includes(payment.truthStatus) &&
      Boolean(payment.updated_at) &&
      payment.updated_at!.slice(0, 10) >= addDays(today, -30)
    ).reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    adjustedRiskTotal: trustedPayments.filter((payment) => ['possible_match', 'unpaid', 'due_soon', 'due_today', 'grace_period', 'overdue', 'needs_review'].includes(payment.truthStatus)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
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
      initialCash: { balance: liquidity.cashAvailableTotal, connectedCash: liquidity.cashAvailablePlaid, manualCash: liquidity.cashAvailableManual, text: 'Parte del efectivo utilizable del Motor Financiero, no del saldo bancario bruto.' },
      lowestPoint: { date: lowestDate, balance: lowest?.balanceAfter ?? liquidity.cashAvailableTotal, payments: events.filter((event) => event.date === lowestDate && event.type === 'payment'), incomeEvents: events.filter((event) => event.date === lowestDate && event.type === 'income'), text: lowestDate ? `Punto más bajo dentro del horizonte activo de ${horizonDays} días.` : 'No hay eventos proyectados dentro del horizonte activo.' },
      finalBalance: { balance, totalIncome, totalPayments, openCommitmentsCount: projectedPayments.length, incomeEventsCount: income.instances.length, text: 'Efectivo utilizable inicial más ingresos esperados, menos únicamente las obligaciones abiertas proyectables dentro del horizonte activo.' },
      income: {
        configuredCount: liquidity.income.allIncome.length,
        considered: income.consideredSchedules,
        excluded: income.excludedSchedules,
        text: liquidity.income.allIncome.length === 0
          ? 'No hay ingresos configurados. El déficit se calcula sin ingresos esperados.'
          : income.instances.length === 0
            ? `Hay ${liquidity.income.allIncome.length} ingreso(s) configurado(s), pero ninguno genera ocurrencias dentro de los próximos ${horizonDays} días.`
            : `${income.consideredSchedules.length} calendario(s) aportan ${income.instances.length} ocurrencia(s) dentro de los próximos ${horizonDays} días.`,
      },
    },
  }
}

export async function getTimelineProjection(
  supabase: FinancialSupabaseClient,
  userId: string,
  options: { horizonDays?: number; today?: string; timeZone?: string } = {}
) {
  const { getLiquiditySummary } = await import('./liquidity.ts')
  const normalizedOptions = {
    ...options,
    today:
      options.today ||
      dateInTimeZone(
        new Date(),
        options.timeZone || DEFAULT_HOUSEHOLD_TIME_ZONE
      ),
  }
  const liquidity = await getLiquiditySummary(
    supabase,
    userId,
    undefined,
    normalizedOptions
  )
  return buildTimelineProjectionFromLiquidity(liquidity, normalizedOptions)
}
