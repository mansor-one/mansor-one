import { buildDashboardSummaryFromParts } from './dashboard'
import { buildMansorDecisionsV1FromSnapshot } from './decision-engine-v1'
import { buildFinancialSummaryFromParts } from './financial-summary'
import { getLiquiditySummary } from './liquidity'
import { getPlanningSummary } from './planning'
import { getPortfolioSummary } from './portfolio'
import { getReviewQueue, type ReviewQueueStatistics } from './review-queue'
import { buildTimelineProjectionFromLiquidity } from './timeline'
import type {
  DashboardSummary,
  FinancialSummary,
  FinancialSupabaseClient,
  IncomeSchedule,
  LiquiditySummary,
  PaymentInstance,
  PlanningSummary,
  PortfolioSummary,
} from './types'
import type { MansorDecision } from './decision-engine-v1'
import type { TimelineProjectionSummary } from './timeline'

export type FinancialEngineReviewQueueSummary = {
  statistics: ReviewQueueStatistics
  readyToConfirmCount: number
  needsCategoryCount: number
  possibleDuplicateCount: number
  athReviewCount: number
  paymentConfirmationCount: number
  needsManualReviewCount: number
}

export type FinancialEngineSnapshot = {
  generatedAt: string
  dashboard: DashboardSummary
  liquidity: LiquiditySummary
  lifecyclePayments: PaymentInstance[]
  projectedIncome: IncomeSchedule[]
  timeline: TimelineProjectionSummary
  portfolio: PortfolioSummary
  planning: PlanningSummary
  financialSummary: FinancialSummary
  decisionEngineV1: MansorDecision[]
  reviewQueue: FinancialEngineReviewQueueSummary
}

export async function getFinancialEngineSnapshot(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<FinancialEngineSnapshot> {
  const portfolioPromise = getPortfolioSummary(supabase, userId)
  const [portfolio, liquidity, planning, reviewQueue] = await Promise.all([
    portfolioPromise,
    getLiquiditySummary(supabase, userId, portfolioPromise),
    getPlanningSummary(supabase, userId),
    getReviewQueue(supabase, userId),
  ])

  const dashboard = buildDashboardSummaryFromParts(liquidity, planning)
  const timeline = buildTimelineProjectionFromLiquidity(liquidity)
  const financialSummary = buildFinancialSummaryFromParts({
    userId,
    portfolio,
    dashboard,
    planning,
  })

  const snapshotWithoutDecisions = {
    generatedAt: financialSummary.generatedAt,
    dashboard,
    liquidity,
    lifecyclePayments: liquidity.lifecyclePayments,
    projectedIncome: liquidity.projectedIncome,
    timeline,
    portfolio,
    planning,
    financialSummary,
    reviewQueue: {
      statistics: reviewQueue.statistics,
      readyToConfirmCount: reviewQueue.readyToConfirm.length,
      needsCategoryCount: reviewQueue.needsCategory.length,
      possibleDuplicateCount: reviewQueue.possibleDuplicate.length,
      athReviewCount: reviewQueue.athReview.length,
      paymentConfirmationCount: reviewQueue.paymentConfirmation.length,
      needsManualReviewCount: reviewQueue.needsManualReview.length,
    },
  }

  const snapshot: FinancialEngineSnapshot = {
    ...snapshotWithoutDecisions,
    decisionEngineV1: [],
  }

  snapshot.decisionEngineV1 = buildMansorDecisionsV1FromSnapshot(snapshot)

  return snapshot
}
