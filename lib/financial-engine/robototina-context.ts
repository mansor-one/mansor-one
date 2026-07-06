import { getFinancialEngineSnapshot } from './snapshot'
import type {
  FinancialSupabaseClient,
  IncomeSchedule,
  PaymentInstance,
  PlanningItem,
} from './types'

type RobototinaInsightTone = 'info' | 'warning' | 'critical' | 'success'
type RobototinaRecommendationKind =
  | 'pay_now'
  | 'wait'
  | 'watch_risk'
  | 'income_expected'
  | 'grace_period_available'
  | 'data_stale_warning'
  | 'review_queue'
type RobototinaConfidenceLevel = 'high' | 'medium' | 'low'

export type RobototinaInsight = {
  id: string
  title: string
  message: string
  tone: RobototinaInsightTone
  href?: string
}

export type RobototinaAdvisorRecommendation = {
  id: string
  kind: RobototinaRecommendationKind
  recommendation: string
  reason: string
  supportingFacts: string[]
  confidenceLevel: RobototinaConfidenceLevel
  tone: RobototinaInsightTone
  href?: string
}

export type RobototinaStaleAccountWarning = {
  id: string
  label: string
  lastUpdatedAt: string | null
  ageHours: number | null
}

export type RobototinaContext = {
  generatedAt: string
  liquidity: {
    availableCash: number
    resultToday: number
    resultAfterIncome: number
    openPayments: PaymentInstance[]
    openPaymentsCount: number
    openPaymentsTotal: number
    gracePeriodPayments: PaymentInstance[]
    projectedIncome: IncomeSchedule[]
    projectedIncomeTotal: number
    staleAccountWarnings: RobototinaStaleAccountWarning[]
  }
  timeline: {
    startingCash: number
    lowestPointDate: string | null
    lowestPointBalance: number
    lowestPointPayments: PaymentInstance[]
    finalBalance: number
  }
  planning: {
    funds: PlanningItem[]
    fundsCount: number
    totalTargetAmount: number
  }
  portfolio: {
    totalAssets: number
    totalLiabilities: number
    netWorth: number
    totalLiquidAvailable: number
  }
  reviewQueue: {
    pendingCount: number
    readyToConfirmCount: number
    needsCategoryCount: number
    possibleDuplicateCount: number
    athReviewCount: number
  }
  decision: {
    overallFinancialState: string
    decisionCount: number
  }
  insights: RobototinaInsight[]
  advisorRecommendations: RobototinaAdvisorRecommendation[]
}

const STALE_ACCOUNT_HOURS = 36

function numeric(value: unknown) {
  return Number(value || 0)
}

function money(value: unknown) {
  return numeric(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function daysFromGeneratedAt(dateValue: string | null | undefined, generatedAt: string) {
  if (!dateValue) return null

  const generatedDate = new Date(`${generatedAt.slice(0, 10)}T00:00:00`)
  const targetDate = new Date(`${dateValue}T00:00:00`)

  if (Number.isNaN(generatedDate.getTime()) || Number.isNaN(targetDate.getTime())) {
    return null
  }

  return Math.ceil(
    (targetDate.getTime() - generatedDate.getTime()) / (1000 * 60 * 60 * 24)
  )
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

function sortPaymentsByDate(a: PaymentInstance, b: PaymentInstance) {
  return paymentDate(a).localeCompare(paymentDate(b))
}

function openLifecyclePayment(payment: PaymentInstance) {
  if (payment.lifecycleIsClosed) return false
  if (payment.lifecycleIsOpen !== undefined) return Boolean(payment.lifecycleIsOpen)

  const status = String(payment.status || payment.lifecycleState || '').toLowerCase()
  return !['paid', 'confirmed', 'cancelled', 'canceled'].includes(status)
}

function staleAccountWarnings(
  accounts: { id?: string; display_name?: string | null; name?: string | null; institution_name?: string | null; updated_at?: string | null }[],
  now: Date
): RobototinaStaleAccountWarning[] {
  return accounts
    .map<RobototinaStaleAccountWarning | null>((account) => {
      if (!account.updated_at) {
        return {
          id: account.id || account.name || 'unknown-account',
          label: [account.institution_name, account.display_name || account.name]
            .filter(Boolean)
            .join(' · ') || 'Cuenta conectada',
          lastUpdatedAt: null,
          ageHours: null,
        }
      }

      const updatedAt = new Date(account.updated_at)
      if (Number.isNaN(updatedAt.getTime())) return null

      const ageHours = Math.floor(
        (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60)
      )

      if (ageHours < STALE_ACCOUNT_HOURS) return null

      return {
        id: account.id || account.name || account.updated_at,
        label: [account.institution_name, account.display_name || account.name]
          .filter(Boolean)
          .join(' · ') || 'Cuenta conectada',
        lastUpdatedAt: account.updated_at,
        ageHours,
      }
    })
    .filter((warning): warning is RobototinaStaleAccountWarning =>
      Boolean(warning)
    )
}

type RobototinaBaseContext = Omit<
  RobototinaContext,
  'insights' | 'advisorRecommendations'
>

function buildInsights(context: RobototinaBaseContext) {
  const insights: RobototinaInsight[] = []
  const firstGracePayment = context.liquidity.gracePeriodPayments[0]

  if (context.liquidity.openPaymentsCount > 0) {
    insights.push({
      id: 'open-payments',
      title: `${context.liquidity.openPaymentsCount} pagos abiertos`,
      message: `El motor financiero ve $${money(context.liquidity.openPaymentsTotal)} en compromisos abiertos cargados en el ciclo actual/proximo.`,
      tone: 'info',
      href: '/timeline',
    })
  }

  if (context.timeline.lowestPointDate) {
    insights.push({
      id: 'lowest-point',
      title: `Punto mas bajo: $${money(context.timeline.lowestPointBalance)}`,
      message: `La proyeccion toca ese nivel el ${context.timeline.lowestPointDate}. Esto viene de la linea de tiempo del motor, no del saldo bancario directo.`,
      tone: context.timeline.lowestPointBalance < 0 ? 'critical' : 'warning',
      href: '/timeline',
    })
  }

  if (firstGracePayment) {
    insights.push({
      id: 'grace-period',
      title: 'Hay pagos dentro de periodo de gracia',
      message: `${firstGracePayment.name || 'Un pago'} esta en gracia hasta ${
        firstGracePayment.grace_until || firstGracePayment.grace_due_date || 'la fecha configurada'
      }. Robototina lo interpreta desde lifecyclePayments.`,
      tone: 'warning',
      href: '/timeline',
    })
  }

  if (context.liquidity.projectedIncomeTotal > 0) {
    insights.push({
      id: 'projected-income',
      title: `Ingresos esperados: $${money(context.liquidity.projectedIncomeTotal)}`,
      message:
        'Estos ingresos aumentan la proyeccion solo cuando el motor los marca como expected/projected.',
      tone: 'success',
      href: '/income',
    })
  }

  if (context.liquidity.staleAccountWarnings.length > 0) {
    insights.push({
      id: 'stale-accounts',
      title: 'Hay balances que pueden estar atrasados',
      message: `${context.liquidity.staleAccountWarnings.length} cuenta(s) conectadas no se han actualizado recientemente. Revisa Portfolio antes de tomar decisiones finas.`,
      tone: 'warning',
      href: '/portfolio',
    })
  }

  if (context.reviewQueue.pendingCount > 0) {
    insights.push({
      id: 'review-queue',
      title: `${context.reviewQueue.pendingCount} movimientos necesitan decision`,
      message:
        'La cola de revision puede cambiar categorias, duplicados o confirmaciones antes de que Robototina recomiende con mas precision.',
      tone: 'info',
      href: '/lab/review-queue',
    })
  }

  insights.push({
    id: 'transfer-boundary',
    title: 'Transferencias no son ingresos',
    message:
      'Mover dinero entre Cooperativa y FirstBank cambia la ubicacion del efectivo, pero no aumenta el cashflow del hogar.',
    tone: 'info',
    href: '/income',
  })

  return insights.slice(0, 5)
}

function paymentLabel(payment: PaymentInstance) {
  return payment.name || 'Pago sin nombre'
}

function paymentAmountFact(payment: PaymentInstance) {
  return `${paymentLabel(payment)}: $${money(payment.amount)}`
}

function buildAdvisorRecommendations(
  context: RobototinaBaseContext
): RobototinaAdvisorRecommendation[] {
  const recommendations: RobototinaAdvisorRecommendation[] = []
  const overduePayments = context.liquidity.openPayments.filter(
    (payment) => payment.isOverdue === true
  )
  const upcomingWithoutGrace = context.liquidity.openPayments.filter((payment) => {
    if (payment.isOverdue || payment.isInGracePeriod) return false

    const daysUntilDue = daysFromGeneratedAt(
      payment.effective_due_date || payment.due_date,
      context.generatedAt
    )

    return (
      daysUntilDue !== null &&
      daysUntilDue >= 0 &&
      daysUntilDue <= 3 &&
      Number(payment.grace_days || 0) <= 0
    )
  })
  const firstGracePayment = context.liquidity.gracePeriodPayments[0]
  const firstProjectedIncome = context.liquidity.projectedIncome[0]
  const lowestBalanceIsTight = context.timeline.lowestPointBalance < 500

  if (overduePayments.length > 0) {
    const total = overduePayments.reduce(
      (sum, payment) => sum + numeric(payment.amount),
      0
    )

    recommendations.push({
      id: 'pay-now-overdue',
      kind: 'pay_now',
      recommendation: 'Pay now',
      reason:
        'There are open payments already marked overdue by the Financial Engine.',
      supportingFacts: [
        `${overduePayments.length} overdue payment(s)`,
        `Overdue total: $${money(total)}`,
        ...overduePayments.slice(0, 2).map(paymentAmountFact),
      ],
      confidenceLevel: 'high',
      tone: 'critical',
      href: '/timeline#payments',
    })
  }

  if (upcomingWithoutGrace.length > 0) {
    const payment = upcomingWithoutGrace[0]
    const daysUntilDue = daysFromGeneratedAt(
      payment.effective_due_date || payment.due_date,
      context.generatedAt
    )

    recommendations.push({
      id: 'pay-now-upcoming-no-grace',
      kind: 'pay_now',
      recommendation: 'Pay now',
      reason:
        'A payment is due soon and the engine does not show a configured grace window.',
      supportingFacts: [
        paymentAmountFact(payment),
        `Due date: ${payment.effective_due_date || payment.due_date || 'not set'}`,
        daysUntilDue === 0
          ? 'Due today'
          : `Due in ${daysUntilDue ?? 'unknown'} day(s)`,
      ],
      confidenceLevel: 'medium',
      tone: 'warning',
      href: '/timeline#payments',
    })
  }

  if (firstGracePayment) {
    recommendations.push({
      id: 'grace-period-available',
      kind: 'grace_period_available',
      recommendation: 'Grace period available',
      reason:
        'The payment is still open, but lifecyclePayments marks it inside its grace period.',
      supportingFacts: [
        paymentAmountFact(firstGracePayment),
        `Grace until: ${
          firstGracePayment.grace_until ||
          firstGracePayment.grace_due_date ||
          'configured date'
        }`,
        `Status: ${
          firstGracePayment.lifecycleLabel ||
          firstGracePayment.status ||
          'open'
        }`,
      ],
      confidenceLevel: 'high',
      tone: 'info',
      href: '/timeline#payments',
    })
  }

  if (firstProjectedIncome) {
    recommendations.push({
      id: 'income-expected',
      kind: 'income_expected',
      recommendation: 'Income expected',
      reason:
        'The projection includes expected income supplied by the Financial Engine income context.',
      supportingFacts: [
        `${firstProjectedIncome.name || 'Expected income'}: $${money(
          firstProjectedIncome.amount
        )}`,
        `Expected date: ${
          firstProjectedIncome.next_expected_date || 'not set'
        }`,
        `Projected income total: $${money(
          context.liquidity.projectedIncomeTotal
        )}`,
      ],
      confidenceLevel:
        firstProjectedIncome.confidence === 'confirmed' ? 'high' : 'medium',
      tone: 'success',
      href: '/income#expected-income',
    })
  }

  if (context.timeline.lowestPointDate && lowestBalanceIsTight) {
    recommendations.push({
      id: 'watch-risk-lowest-balance',
      kind: 'watch_risk',
      recommendation: 'Watch risk',
      reason:
        'The timeline projection shows a low point that deserves attention before extra spending.',
      supportingFacts: [
        `Lowest projected balance: $${money(
          context.timeline.lowestPointBalance
        )}`,
        `Lowest point date: ${context.timeline.lowestPointDate}`,
        `${context.timeline.lowestPointPayments.length} payment(s) explain that point`,
      ],
      confidenceLevel: 'high',
      tone: context.timeline.lowestPointBalance < 0 ? 'critical' : 'warning',
      href: '/timeline#lowest-point',
    })
  }

  if (context.liquidity.staleAccountWarnings.length > 0) {
    const firstWarning = context.liquidity.staleAccountWarnings[0]

    recommendations.push({
      id: 'data-stale-warning',
      kind: 'data_stale_warning',
      recommendation: 'Data stale warning',
      reason:
        'Some connected balances may not reflect the latest bank state.',
      supportingFacts: [
        `${context.liquidity.staleAccountWarnings.length} stale account warning(s)`,
        `${firstWarning.label}: ${
          firstWarning.ageHours === null
            ? 'missing sync timestamp'
            : `${firstWarning.ageHours} hours old`
        }`,
      ],
      confidenceLevel: 'medium',
      tone: 'warning',
      href: '/portfolio#plaid-connections',
    })
  }

  if (context.reviewQueue.pendingCount > 0) {
    recommendations.push({
      id: 'review-queue-items',
      kind: 'review_queue',
      recommendation: 'Review queue items',
      reason:
        'Pending review decisions can change categories, duplicates, and payment confirmation context.',
      supportingFacts: [
        `${context.reviewQueue.pendingCount} item(s) pending`,
        `${context.reviewQueue.possibleDuplicateCount} possible duplicate(s)`,
        `${context.reviewQueue.needsCategoryCount} category review item(s)`,
      ],
      confidenceLevel: 'high',
      tone: 'info',
      href: '/lab/review-queue#queue',
    })
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'wait-no-urgent-action',
      kind: 'wait',
      recommendation: 'Wait',
      reason:
        'The engine context does not show overdue payments, stale balances, or pending review pressure right now.',
      supportingFacts: [
        `${context.liquidity.openPaymentsCount} open payment(s) loaded`,
        `Projected final balance: $${money(context.timeline.finalBalance)}`,
      ],
      confidenceLevel: 'medium',
      tone: 'success',
      href: '/timeline#projection',
    })
  }

  if (
    recommendations.length < 3 &&
    !recommendations.some((recommendation) => recommendation.id === 'watch-risk-lowest-balance')
  ) {
    recommendations.push({
      id: 'watch-risk-projection',
      kind: 'watch_risk',
      recommendation: 'Watch risk',
      reason:
        'Use the timeline projection as a planning guide before taking optional actions.',
      supportingFacts: [
        `Lowest projected balance: $${money(
          context.timeline.lowestPointBalance
        )}`,
        `Lowest point date: ${context.timeline.lowestPointDate || 'not set'}`,
        `Final projected balance: $${money(context.timeline.finalBalance)}`,
      ],
      confidenceLevel: 'medium',
      tone: 'info',
      href: '/timeline#lowest-point',
    })
  }

  if (
    recommendations.length < 3 &&
    !recommendations.some((recommendation) => recommendation.kind === 'review_queue')
  ) {
    recommendations.push({
      id: 'review-queue-clear',
      kind: 'review_queue',
      recommendation: 'Review queue items',
      reason:
        'No urgent review queue pressure is showing, but this is still the place to clear decisions before relying on advice.',
      supportingFacts: [
        `${context.reviewQueue.pendingCount} item(s) pending`,
        `${context.reviewQueue.readyToConfirmCount} ready to confirm`,
      ],
      confidenceLevel: 'medium',
      tone: 'info',
      href: '/lab/review-queue#queue',
    })
  }

  if (
    recommendations.length < 3 &&
    !recommendations.some((recommendation) => recommendation.kind === 'wait')
  ) {
    recommendations.push({
      id: 'wait-for-cleaner-signal',
      kind: 'wait',
      recommendation: 'Wait',
      reason:
        'No additional urgent rule fired after the current higher-priority recommendations.',
      supportingFacts: [
        `Available cash: $${money(context.liquidity.availableCash)}`,
        `Open payments: ${context.liquidity.openPaymentsCount}`,
      ],
      confidenceLevel: 'low',
      tone: 'info',
      href: '/timeline#projection',
    })
  }

  return recommendations.slice(0, 5)
}

export async function getRobototinaContext(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<RobototinaContext> {
  const snapshot = await getFinancialEngineSnapshot(supabase, userId)

  const now = new Date()
  const liquidity = snapshot.liquidity
  const openPayments = liquidity.lifecyclePayments
    .filter(openLifecyclePayment)
    .sort(sortPaymentsByDate)
  const gracePeriodPayments = openPayments.filter(
    (payment) => payment.isInGracePeriod
  )
  const openPaymentsTotal = openPayments.reduce(
    (total, payment) => total + numeric(payment.amount),
    0
  )
  const contextWithoutInsights: RobototinaBaseContext = {
    generatedAt: snapshot.generatedAt,
    liquidity: {
      availableCash: liquidity.cashAvailableTotal,
      resultToday: liquidity.resultToday,
      resultAfterIncome: liquidity.resultAfterIncome,
      openPayments,
      openPaymentsCount: openPayments.length,
      openPaymentsTotal,
      gracePeriodPayments,
      projectedIncome: liquidity.projectedIncome,
      projectedIncomeTotal: liquidity.totalProjectedIncome,
      staleAccountWarnings: staleAccountWarnings(
        liquidity.connectedAccounts,
        now
      ),
    },
    timeline: {
      startingCash: snapshot.timeline.startingCash,
      lowestPointDate: snapshot.timeline.explanation.lowestPoint.date,
      lowestPointBalance: snapshot.timeline.explanation.lowestPoint.balance,
      lowestPointPayments: snapshot.timeline.explanation.lowestPoint.payments.map(
        (event, index) => ({
          id: `${event.date}-${event.title}-${index}`,
          name: event.title,
          amount: Math.abs(event.amount),
          effective_due_date: event.date,
          isInGracePeriod: event.isInGracePeriod,
          lifecycleLabel: event.status,
        })
      ),
      finalBalance: snapshot.timeline.finalBalance,
    },
    planning: {
      funds: snapshot.planning.planningItems,
      fundsCount: snapshot.planning.planningItems.length,
      totalTargetAmount: snapshot.planning.totalFutureObligations,
    },
    portfolio: {
      totalAssets: snapshot.portfolio.totalAssets,
      totalLiabilities: snapshot.portfolio.totalLiabilities,
      netWorth: snapshot.portfolio.netWorth,
      totalLiquidAvailable: snapshot.portfolio.totalLiquidAvailable,
    },
    reviewQueue: {
      pendingCount: snapshot.reviewQueue.statistics.totalCandidates,
      readyToConfirmCount: snapshot.reviewQueue.readyToConfirmCount,
      needsCategoryCount: snapshot.reviewQueue.needsCategoryCount,
      possibleDuplicateCount: snapshot.reviewQueue.possibleDuplicateCount,
      athReviewCount: snapshot.reviewQueue.athReviewCount,
    },
    decision: {
      overallFinancialState:
        snapshot.decisionEngineResult.overallFinancialState,
      decisionCount: snapshot.decisionEngineResult.decisions.length,
    },
  }

  return {
    ...contextWithoutInsights,
    insights: buildInsights(contextWithoutInsights),
    advisorRecommendations: buildAdvisorRecommendations(contextWithoutInsights),
  }
}
