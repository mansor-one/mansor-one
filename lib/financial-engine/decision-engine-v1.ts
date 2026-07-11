import type { FinancialEngineSnapshot } from './snapshot'
import type { IncomeSchedule, PaymentInstance, PlanningItem } from './types'

export type MansorDecisionType =
  | 'pay_now'
  | 'wait'
  | 'warning'
  | 'opportunity'
  | 'planning'
  | 'review_needed'

export type MansorDecisionSeverity = 'info' | 'warning' | 'critical'
export type MansorDecisionConfidence = 'low' | 'medium' | 'high'

export type MansorDecision = {
  id: string
  type: MansorDecisionType
  priority: number
  severity: MansorDecisionSeverity
  title: string
  recommendation: string
  explanation: string
  evidence: string[]
  confidence: MansorDecisionConfidence
  actionLabel: string
  actionHref: string
  expiresAt?: string
}

const DUE_SOON_DAYS = 3
const INCOME_WINDOW_DAYS = 7
const LOW_POSITIVE_BALANCE = 500
const REVIEW_QUEUE_THRESHOLD = 3
const STALE_ACCOUNT_HOURS = 36
const NEARLY_COMPLETE_RATIO = 0.9

function numeric(value: unknown) {
  return Number(value || 0)
}

function money(value: unknown) {
  return numeric(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function dateOnly(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function daysFromGeneratedAt(
  dateValue: string | null | undefined,
  generatedAt: string
) {
  if (!dateValue) return null

  const generatedDate = dateOnly(new Date(generatedAt))
  const targetDate = dateOnly(new Date(`${dateValue}T00:00:00`))

  if (Number.isNaN(generatedDate.getTime()) || Number.isNaN(targetDate.getTime())) {
    return null
  }

  return Math.ceil(
    (targetDate.getTime() - generatedDate.getTime()) / (1000 * 60 * 60 * 24)
  )
}

function paymentLabel(payment: PaymentInstance) {
  return payment.name || 'Payment'
}

function paymentDate(payment: PaymentInstance) {
  return (
    payment.effective_due_date ||
    payment.due_date ||
    payment.expected_date ||
    payment.grace_until ||
    ''
  )
}

function paymentGraceUntil(payment: PaymentInstance) {
  return payment.grace_until || payment.grace_due_date || null
}

function hasGracePeriod(payment: PaymentInstance) {
  return Boolean(paymentGraceUntil(payment) || numeric(payment.grace_days) > 0)
}

function openLifecyclePayment(payment: PaymentInstance) {
  if (payment.lifecycleIsClosed) return false
  if (payment.lifecycleIsOpen !== undefined) return Boolean(payment.lifecycleIsOpen)

  const status = String(payment.status || payment.lifecycleState || '').toLowerCase()
  return !['paid', 'confirmed', 'cancelled', 'canceled'].includes(status)
}

function paymentAmountFact(payment: PaymentInstance) {
  return `${paymentLabel(payment)}: $${money(payment.amount)}`
}

function incomeDate(income: IncomeSchedule) {
  return income.next_expected_date || null
}

function isTransferIncome(income: IncomeSchedule) {
  const markers = [
    income.category_code,
    income.income_type,
    income.name,
    income.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return markers.includes('transfer') || markers.includes('traspaso')
}

function isProjectedIncome(income: IncomeSchedule) {
  if (isTransferIncome(income)) return false

  const status = String(income.status || 'expected').toLowerCase()
  return !['received', 'cancelled', 'canceled', 'missed'].includes(status)
}

function firstIncomeBefore(
  income: IncomeSchedule[],
  generatedAt: string,
  dateValue: string | null
) {
  if (!dateValue) return null

  const targetDays = daysFromGeneratedAt(dateValue, generatedAt)
  if (targetDays === null) return null

  return income
    .filter(isProjectedIncome)
    .filter((incomeItem) => {
      const days = daysFromGeneratedAt(incomeDate(incomeItem), generatedAt)
      return days !== null && days >= 0 && days <= targetDays
    })
    .sort((a, b) => String(incomeDate(a)).localeCompare(String(incomeDate(b))))[0] || null
}

function paymentSeverity(payment: PaymentInstance, criticalDefault = false) {
  if (criticalDefault) return 'critical' as const
  if (numeric(payment.amount) >= 1000) return 'critical' as const
  return 'warning' as const
}

function paymentDecisions(snapshot: FinancialEngineSnapshot) {
  const income = snapshot.projectedIncome.filter(isProjectedIncome)
  const payments = snapshot.lifecyclePayments
    .filter(openLifecyclePayment)
    .sort((a, b) => paymentDate(a).localeCompare(paymentDate(b)))

  const decisions: MansorDecision[] = []

  payments.forEach((payment) => {
    const dueDate = payment.effective_due_date || payment.due_date || null
    const daysUntilDue = daysFromGeneratedAt(dueDate, snapshot.generatedAt)
    const graceUntil = paymentGraceUntil(payment)
    const incomeBeforeGrace = firstIncomeBefore(
      income,
      snapshot.generatedAt,
      graceUntil
    )

    if (payment.isOverdue || (daysUntilDue !== null && daysUntilDue < 0)) {
      decisions.push({
        id: `payment-overdue:${payment.id}`,
        type: 'pay_now',
        priority: 100,
        severity: 'critical',
        title: `${paymentLabel(payment)} is overdue`,
        recommendation: 'Pay this now or confirm it if it was already paid.',
        explanation:
          'The Financial Engine marks this payment as open and past its due date.',
        evidence: [
          paymentAmountFact(payment),
          `Due date: ${dueDate || 'not set'}`,
          `Status: ${payment.lifecycleLabel || payment.status || 'open'}`,
        ],
        confidence: 'high',
        actionLabel: 'Review payment',
        actionHref: '/timeline#payments',
        expiresAt: graceUntil || dueDate || undefined,
      })
      return
    }

    if (hasGracePeriod(payment) && graceUntil && incomeBeforeGrace) {
      decisions.push({
        id: `payment-income-before-grace:${payment.id}`,
        type: 'wait',
        priority: payment.isInGracePeriod ? 86 : 82,
        severity: 'info',
        title: `${paymentLabel(payment)} has income before grace ends`,
        recommendation:
          'Wait for the expected income, then pay before the grace deadline.',
        explanation:
          'The payment is open, has a visible grace date, and projected income arrives before grace_until.',
        evidence: [
          paymentAmountFact(payment),
          `Grace until: ${graceUntil}`,
          `Income before grace: ${incomeBeforeGrace.name || 'Expected income'} on ${incomeDate(incomeBeforeGrace)}`,
        ],
        confidence: 'high',
        actionLabel: 'View timeline',
        actionHref: '/timeline#payments',
        expiresAt: graceUntil,
      })
      return
    }

    if (payment.isInGracePeriod && graceUntil) {
      decisions.push({
        id: `payment-grace:${payment.id}`,
        type: 'warning',
        priority: 88,
        severity: 'warning',
        title: `${paymentLabel(payment)} is inside its grace window`,
        recommendation:
          'Use the grace window, but keep this payment visible.',
        explanation:
          'The payment is open inside its configured grace period. It is not the same as being safely ignored.',
        evidence: [
          paymentAmountFact(payment),
          `Grace until: ${graceUntil}`,
          'No projected income before grace end',
        ],
        confidence: 'medium',
        actionLabel: 'View timeline',
        actionHref: '/timeline#payments',
        expiresAt: graceUntil,
      })
      return
    }

    if (
      daysUntilDue !== null &&
      daysUntilDue >= 0 &&
      daysUntilDue <= DUE_SOON_DAYS
    ) {
      const severity = paymentSeverity(payment)
      const decisionType = hasGracePeriod(payment) ? 'warning' : 'pay_now'

      decisions.push({
        id: `payment-due-soon:${payment.id}`,
        type: decisionType,
        priority: hasGracePeriod(payment) ? 84 : 92,
        severity,
        title: `${paymentLabel(payment)} is due soon`,
        recommendation: hasGracePeriod(payment)
          ? 'Prepare the payment and use the grace date only if cash timing requires it.'
          : 'Pay this soon because no grace period is visible in the engine output.',
        explanation: hasGracePeriod(payment)
          ? 'The payment is due within three days and has grace metadata available.'
          : 'The payment is due within three days and the Financial Engine does not expose a grace window.',
        evidence: [
          paymentAmountFact(payment),
          daysUntilDue === 0 ? 'Due today' : `Due in ${daysUntilDue} day(s)`,
          graceUntil ? `Grace until: ${graceUntil}` : 'No grace period shown',
        ],
        confidence: hasGracePeriod(payment) ? 'medium' : 'high',
        actionLabel: 'Review payment',
        actionHref: '/timeline#payments',
        expiresAt: graceUntil || dueDate || undefined,
      })
    }
  })

  return decisions
}

function timelineDecision(snapshot: FinancialEngineSnapshot): MansorDecision | null {
  const lowestPoint = snapshot.timeline.explanation.lowestPoint
  const lowestBalance = snapshot.timeline.minimumBalance
  const lowestDate = lowestPoint.date

  if (lowestBalance >= LOW_POSITIVE_BALANCE) return null

  const causes = [
    ...lowestPoint.payments.slice(0, 2).map((event) => `${event.title}: $${money(Math.abs(event.amount))}`),
    ...lowestPoint.incomeEvents.slice(0, 1).map((event) => `${event.title}: +$${money(event.amount)}`),
  ]

  if (lowestBalance < 0) {
    return {
      id: 'timeline-negative-lowest-balance',
      type: 'warning',
      priority: 96,
      severity: 'critical',
      title: 'Timeline projection goes below zero',
      recommendation:
        'Protect cash before optional spending or non-critical funding.',
      explanation:
        'The official timeline projection shows the lowest projected balance below zero.',
      evidence: [
        `Lowest projected balance: $${money(lowestBalance)}`,
        `Lowest point date: ${lowestDate || 'not set'}`,
        causes.length > 0 ? `Major causes: ${causes.join(', ')}` : lowestPoint.text,
      ],
      confidence: 'high',
      actionLabel: 'View timeline',
      actionHref: '/timeline#lowest-point',
      expiresAt: lowestDate || undefined,
    }
  }

  return {
    id: 'timeline-low-positive-balance',
    type: 'planning',
    priority: 76,
    severity: 'warning',
    title: 'Timeline balance gets tight',
    recommendation:
      'Plan payments and funding in date order before adding optional commitments.',
    explanation:
      'The timeline stays positive, but the lowest point is close enough to deserve planning attention.',
    evidence: [
      `Lowest projected balance: $${money(lowestBalance)}`,
      `Lowest point date: ${lowestDate || 'not set'}`,
      causes.length > 0 ? `Major causes: ${causes.join(', ')}` : lowestPoint.text,
    ],
    confidence: 'high',
    actionLabel: 'View projection',
    actionHref: '/timeline#lowest-point',
    expiresAt: lowestDate || undefined,
  }
}

function incomeDecision(snapshot: FinancialEngineSnapshot): MansorDecision | null {
  const upcomingIncome = snapshot.projectedIncome
    .filter(isProjectedIncome)
    .filter((income) => {
      const days = daysFromGeneratedAt(incomeDate(income), snapshot.generatedAt)
      return days !== null && days >= 0 && days <= INCOME_WINDOW_DAYS
    })
    .sort((a, b) => String(incomeDate(a)).localeCompare(String(incomeDate(b))))[0]

  if (!upcomingIncome) return null

  const estimated =
    upcomingIncome.amount_is_estimated ||
    String(upcomingIncome.confidence || '').toLowerCase() === 'estimated'

  return {
    id: `income-upcoming:${upcomingIncome.id || incomeDate(upcomingIncome) || upcomingIncome.name}`,
    type: snapshot.liquidity.resultToday < 0 ? 'wait' : 'opportunity',
    priority: snapshot.liquidity.resultToday < 0 ? 86 : 66,
    severity: 'info',
    title: 'Income is expected soon',
    recommendation:
      'Use the expected income timing before making major cash decisions.',
    explanation: estimated
      ? 'The Financial Engine projects income within seven days, but the amount or confidence is estimated.'
      : 'The Financial Engine projects income within seven days.',
    evidence: [
      `${upcomingIncome.name || 'Expected income'}: $${money(upcomingIncome.amount)}`,
      `Expected date: ${incomeDate(upcomingIncome) || 'not set'}`,
      estimated ? 'Confidence: estimated' : `Confidence: ${upcomingIncome.confidence || 'projected'}`,
    ],
    confidence: estimated ? 'medium' : 'high',
    actionLabel: 'View income',
    actionHref: '/income#expected-income',
    expiresAt: incomeDate(upcomingIncome) || undefined,
  }
}

function isFund(item: PlanningItem) {
  return !item.item_type || item.item_type === 'fund'
}

function planningDecisions(snapshot: FinancialEngineSnapshot) {
  const decisions: MansorDecision[] = []
  const funds = snapshot.planning.planningItems.filter(isFund)
  const obligationsPressureHigh =
    snapshot.planning.totalFutureObligations >
      snapshot.portfolio.totalLiquidAvailable || snapshot.liquidity.resultToday < 0

  const emptyFund = funds.find(
    (fund) => numeric(fund.target_amount) > 0 && numeric(fund.current_amount) <= 0
  )
  if (emptyFund) {
    decisions.push({
      id: `planning-empty-fund:${emptyFund.id}`,
      type: 'planning',
      priority: obligationsPressureHigh ? 58 : 62,
      severity: 'info',
      title: `${emptyFund.name || 'Planning fund'} has no allocation yet`,
      recommendation: obligationsPressureHigh
        ? 'Protect cash first, then fund this after critical obligations are covered.'
        : 'Decide whether this fund should receive an initial allocation.',
      explanation:
        'Planning shows an active fund with a target amount, but no allocated amount yet.',
      evidence: [
        `Target: $${money(emptyFund.target_amount)}`,
        `Allocated: $${money(emptyFund.current_amount)}`,
        obligationsPressureHigh
          ? 'Obligations pressure is high'
          : 'No high obligations pressure detected',
      ],
      confidence: 'medium',
      actionLabel: 'Review planning',
      actionHref: '/planning#funds',
    })
  }

  const nearlyCompleteFund = funds.find((fund) => {
    const target = numeric(fund.target_amount)
    const current = numeric(fund.current_amount)
    return target > 0 && current > 0 && current < target && current / target >= NEARLY_COMPLETE_RATIO
  })
  if (nearlyCompleteFund) {
    decisions.push({
      id: `planning-nearly-complete:${nearlyCompleteFund.id}`,
      type: 'opportunity',
      priority: obligationsPressureHigh ? 52 : 68,
      severity: 'info',
      title: `${nearlyCompleteFund.name || 'Planning fund'} is nearly complete`,
      recommendation: obligationsPressureHigh
        ? 'Keep this visible, but cover payment pressure before topping it off.'
        : 'Consider finishing this fund if cash remains comfortable.',
      explanation:
        'Planning shows a fund that is close to its target allocation.',
      evidence: [
        `Allocated: $${money(nearlyCompleteFund.current_amount)}`,
        `Target: $${money(nearlyCompleteFund.target_amount)}`,
        `${Math.round((numeric(nearlyCompleteFund.current_amount) / numeric(nearlyCompleteFund.target_amount)) * 100)}% funded`,
      ],
      confidence: 'medium',
      actionLabel: 'View fund',
      actionHref: '/planning#funds',
    })
  }

  if (obligationsPressureHigh && funds.length > 0) {
    decisions.push({
      id: 'planning-protect-cash',
      type: 'planning',
      priority: 74,
      severity: 'warning',
      title: 'Protect cash before non-critical funding',
      recommendation:
        'Pause optional fund allocations until the payment pressure clears.',
      explanation:
        'Planning has active funds while obligations pressure is high in the official engine outputs.',
      evidence: [
        `Planning target total: $${money(snapshot.planning.totalFutureObligations)}`,
        `Available liquid cash: $${money(snapshot.portfolio.totalLiquidAvailable)}`,
        `Result today: $${money(snapshot.liquidity.resultToday)}`,
      ],
      confidence: 'high',
      actionLabel: 'Review planning',
      actionHref: '/planning#funds',
    })
  }

  return decisions
}

function reviewQueueDecision(snapshot: FinancialEngineSnapshot): MansorDecision | null {
  const pendingCount = snapshot.reviewQueue.statistics.totalCandidates

  if (pendingCount < REVIEW_QUEUE_THRESHOLD) return null

  return {
    id: 'review-queue-pending',
    type: 'review_needed',
    priority: 70,
    severity: pendingCount >= 8 ? 'warning' : 'info',
    title: 'Review queue needs attention',
    recommendation:
      'Clear the review items that affect categories, duplicate risk, or payment confirmation.',
    explanation:
      'Pending review items can affect data quality before Robototina explains the next decision.',
    evidence: [
      `${pendingCount} pending review candidate(s)`,
      `${snapshot.reviewQueue.possibleDuplicateCount} possible duplicate(s)`,
      `${snapshot.reviewQueue.needsCategoryCount} category review item(s)`,
    ],
    confidence: 'high',
    actionLabel: 'Open review queue',
    actionHref: '/lab/review-queue#queue',
  }
}

function portfolioDecision(snapshot: FinancialEngineSnapshot): MansorDecision | null {
  const now = new Date(snapshot.generatedAt)
  const staleAccounts = snapshot.liquidity.connectedAccounts.filter((account) => {
    if (!account.updated_at) return true

    const updatedAt = new Date(account.updated_at)
    if (Number.isNaN(updatedAt.getTime()) || Number.isNaN(now.getTime())) {
      return false
    }

    const ageHours = Math.floor(
      (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60)
    )

    return ageHours >= STALE_ACCOUNT_HOURS
  })

  if (staleAccounts.length === 0) return null

  const first = staleAccounts[0]
  const label = [first.institution_name, first.display_name || first.name]
    .filter(Boolean)
    .join(' - ') || 'Connected account'

  return {
    id: 'portfolio-stale-accounts',
    type: 'warning',
    priority: 72,
    severity: 'warning',
    title: 'Some account balances may be stale',
    recommendation:
      'Sync Portfolio before making a major cash decision.',
    explanation:
      'The Financial Engine exposes connected accounts whose balance timestamps are old or missing.',
    evidence: [
      `${staleAccounts.length} stale account warning(s)`,
      `${label}: ${first.updated_at || 'missing sync timestamp'}`,
    ],
    confidence: 'medium',
    actionLabel: 'Review Portfolio',
    actionHref: '/portfolio#plaid-connections',
  }
}

function fallbackDecision(snapshot: FinancialEngineSnapshot): MansorDecision {
  return {
    id: 'wait-no-urgent-action',
    type: 'wait',
    priority: 10,
    severity: 'info',
    title: 'No urgent action is showing',
    recommendation:
      'Wait and keep using the timeline as the source for payment timing.',
    explanation:
      'Decision Engine v1 did not find overdue payments, negative projections, stale account pressure, or review queue pressure.',
    evidence: [
      `${snapshot.lifecyclePayments.filter(openLifecyclePayment).length} open payment(s) loaded`,
      `Final projected balance: $${money(snapshot.timeline.finalBalance)}`,
    ],
    confidence: 'medium',
    actionLabel: 'View projection',
    actionHref: '/timeline#projection',
  }
}

export function buildMansorDecisionsV1FromSnapshot(
  snapshot: FinancialEngineSnapshot
): MansorDecision[] {
  const decisions = [
    ...paymentDecisions(snapshot),
    timelineDecision(snapshot),
    incomeDecision(snapshot),
    ...planningDecisions(snapshot),
    reviewQueueDecision(snapshot),
    portfolioDecision(snapshot),
  ].filter((decision): decision is MansorDecision => decision !== null)

  const sortedDecisions = decisions
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return a.id.localeCompare(b.id)
    })
    .slice(0, 5)

  return sortedDecisions.length > 0
    ? sortedDecisions
    : [fallbackDecision(snapshot)]
}
