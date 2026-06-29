import { getFinancialSummary } from './financial-summary'
import type {
  DecisionEngineResult,
  FinancialDecision,
  FinancialDecisionSeverity,
  FinancialSupabaseClient,
  FinancialSummary,
  OverallFinancialState,
  PaymentInstance,
} from './types'

const UPCOMING_PAYMENT_WINDOW_DAYS = 2

function dateOnly(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function daysUntil(dateValue: string, generatedAt: string) {
  const generatedDate = dateOnly(new Date(generatedAt))
  const dueDate = dateOnly(new Date(`${dateValue}T00:00:00`))
  const millisecondsPerDay = 24 * 60 * 60 * 1000

  return Math.ceil(
    (dueDate.getTime() - generatedDate.getTime()) / millisecondsPerDay
  )
}

function paymentDecision(
  payment: PaymentInstance,
  generatedAt: string
): FinancialDecision {
  const dueInDays = payment.effective_due_date
    ? daysUntil(payment.effective_due_date, generatedAt)
    : null
  const isOverdue = dueInDays !== null && dueInDays < 0
  const dueText =
    dueInDays === null
      ? 'has no due date'
      : isOverdue
        ? `was due ${Math.abs(dueInDays)} day(s) ago`
        : `is due in ${dueInDays} day(s)`

  return {
    id: `upcoming_payment:${payment.id}`,
    priority: 0,
    impactScore: isOverdue ? 95 : 85,
    severity: isOverdue ? 'critical' : 'warning',
    type: 'upcoming_payment',
    title: `${payment.name || 'Payment'} needs attention`,
    explanation: `${payment.name || 'A payment'} ${dueText}. Amount: ${Number(
      payment.amount || 0
    ).toFixed(2)}.`,
    recommendation: 'Confirm whether this payment should be paid now.',
    confidence: 0.9,
    actionUrl: '/',
    generatedAt,
  }
}

function initiatedPaymentFollowupDecision(
  payment: PaymentInstance,
  generatedAt: string
): FinancialDecision {
  const dueInDays = payment.effective_due_date
    ? daysUntil(payment.effective_due_date, generatedAt)
    : null
  const dueText =
    dueInDays === null
      ? 'has no due date'
      : dueInDays < 0
        ? `was due ${Math.abs(dueInDays)} day(s) ago`
        : 'is due today'

  return {
    id: `initiated_payment_followup:${payment.id}`,
    priority: 0,
    impactScore: 45,
    severity: 'info',
    type: 'initiated_payment_followup',
    title: `${payment.name || 'Payment'} is waiting for confirmation`,
    explanation: `${payment.name || 'A payment'} ${dueText}. Amount: ${Number(
      payment.amount || 0
    ).toFixed(2)}.`,
    recommendation: `${
      payment.name || 'This payment'
    } payment is initiated and waiting for confirmation.`,
    confidence: 0.85,
    actionUrl: '/',
    generatedAt,
  }
}

function pendingReviewDecision(summary: FinancialSummary): FinancialDecision | null {
  const count = summary.briefing.pendingReviewCount

  if (count <= 0) return null

  return {
    id: 'pending_transaction_reviews',
    priority: 0,
    impactScore: Math.min(80, 50 + count * 5),
    severity: count >= 3 ? 'warning' : 'info',
    type: 'transaction_review',
    title: 'Review pending transactions',
    explanation: `${count} transaction review item(s) are waiting for confirmation.`,
    recommendation: 'Review transaction categories so reports and advice stay accurate.',
    confidence: 0.8,
    actionUrl: '/robototina',
    generatedAt: summary.generatedAt,
  }
}

function negativeResultTodayDecision(
  summary: FinancialSummary
): FinancialDecision | null {
  const resultToday = summary.briefing.resultToday

  if (resultToday >= 0) return null

  return {
    id: 'negative_result_today',
    priority: 0,
    impactScore: 100,
    severity: 'critical',
    type: 'negative_cashflow',
    title: 'Payments exceed available cash',
    explanation: `Projected cash after pending payments is ${resultToday.toFixed(
      2
    )}.`,
    recommendation:
      'Preserve cash, delay discretionary spending, or confirm incoming cash before paying more obligations.',
    confidence: 0.95,
    actionUrl: '/',
    generatedAt: summary.generatedAt,
  }
}

function planningPressureDecision(
  summary: FinancialSummary
): FinancialDecision | null {
  const obligations = summary.source.planning.totalFutureObligations
  const availableToday = summary.briefing.availableToday

  if (obligations <= availableToday) return null

  return {
    id: 'planning_pressure',
    priority: 0,
    impactScore: 70,
    severity: 'warning',
    type: 'planning_pressure',
    title: 'Planning obligations exceed available cash',
    explanation: `Open planning obligations are ${obligations.toFixed(
      2
    )}, while usable cash is ${availableToday.toFixed(2)}.`,
    recommendation:
      'Review planning items and decide which obligations should be funded first.',
    confidence: 0.9,
    actionUrl: '/',
    generatedAt: summary.generatedAt,
  }
}

function upcomingPaymentDecisions(summary: FinancialSummary) {
  return summary.source.liquidity.pendingActionPayments
    .filter((payment) => {
      if (!payment.effective_due_date) return false

      return (
        daysUntil(payment.effective_due_date, summary.generatedAt) <=
        UPCOMING_PAYMENT_WINDOW_DAYS
      )
    })
    .map((payment) => paymentDecision(payment, summary.generatedAt))
}

function initiatedPaymentFollowupDecisions(summary: FinancialSummary) {
  return summary.source.liquidity.initiatedPayments
    .filter((payment) => {
      if (!payment.effective_due_date) return false

      return daysUntil(payment.effective_due_date, summary.generatedAt) <= 0
    })
    .map((payment) =>
      initiatedPaymentFollowupDecision(payment, summary.generatedAt)
    )
}

function overallFinancialState(
  decisions: FinancialDecision[]
): OverallFinancialState {
  const severities = new Set<FinancialDecisionSeverity>(
    decisions.map((decision) => decision.severity)
  )

  if (severities.has('critical')) return 'critical'
  if (severities.has('warning')) return 'pressure'
  if (severities.has('info')) return 'watch'
  return 'calm'
}

export function buildDecisionQueue(summary: FinancialSummary) {
  const decisions = [
    ...upcomingPaymentDecisions(summary),
    ...initiatedPaymentFollowupDecisions(summary),
    pendingReviewDecision(summary),
    negativeResultTodayDecision(summary),
    planningPressureDecision(summary),
  ].filter((decision): decision is FinancialDecision => decision !== null)

  return decisions
    .sort((a, b) => b.impactScore - a.impactScore)
    .map((decision, index) => ({
      ...decision,
      priority: index + 1,
    }))
}

export async function getDecisionEngineResult(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<DecisionEngineResult> {
  const summary = await getFinancialSummary(supabase, userId)
  const decisions = buildDecisionQueue(summary)

  return {
    overallFinancialState: overallFinancialState(decisions),
    decisions,
    source: summary,
  }
}
