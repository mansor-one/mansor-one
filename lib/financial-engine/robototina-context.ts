import { getFinancialEngineSnapshot } from './snapshot'
import type { MansorDecision } from './decision-engine-v1'
import type {
  FinancialSupabaseClient,
  IncomeSchedule,
  PaymentInstance,
  PlanningItem,
} from './types'

type RobototinaInsightTone = 'info' | 'warning' | 'critical' | 'success'
type RobototinaRecommendationKind =
  | MansorDecision['type']
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
  decisions: MansorDecision[]
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
  'insights' | 'decisions' | 'advisorRecommendations'
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

function decisionTone(decision: MansorDecision): RobototinaInsightTone {
  if (decision.severity === 'critical') return 'critical'
  if (decision.severity === 'warning') return 'warning'
  if (decision.type === 'opportunity') return 'success'
  return 'info'
}

function decisionState(decisions: MansorDecision[]) {
  if (decisions.some((decision) => decision.severity === 'critical')) {
    return 'critical'
  }

  if (decisions.some((decision) => decision.severity === 'warning')) {
    return 'warning'
  }

  return 'stable'
}

function buildAdvisorRecommendations(
  decisions: MansorDecision[]
): RobototinaAdvisorRecommendation[] {
  return decisions.map((decision) => ({
    id: decision.id,
    kind: decision.type,
    recommendation: decision.title,
    reason: decision.recommendation,
    supportingFacts: decision.evidence,
    confidenceLevel: decision.confidence,
    tone: decisionTone(decision),
    href: decision.actionHref,
  }))
}

export async function getRobototinaContext(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<RobototinaContext> {
  const snapshot = await getFinancialEngineSnapshot(supabase, userId)
  const decisions = snapshot.decisionEngineV1

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
      overallFinancialState: decisionState(decisions),
      decisionCount: decisions.length,
    },
  }

  return {
    ...contextWithoutInsights,
    insights: buildInsights(contextWithoutInsights),
    decisions,
    advisorRecommendations: buildAdvisorRecommendations(decisions),
  }
}
