import { getLiquiditySummary } from './liquidity'
import { getPlanningSummary } from './planning'
import type {
  DashboardSummary,
  FinancialSupabaseClient,
  LiquiditySummary,
  PlanningSummary,
} from './types'

export function buildDashboardSummaryFromParts(
  liquidity: LiquiditySummary,
  planning: PlanningSummary
): DashboardSummary {
  return {
    liquidity,
    planning: {
      ...planning,
      overduePayments: liquidity.overduePayments,
    },
  }
}

export async function getDashboardSummary(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<DashboardSummary> {
  const [liquidity, planning] = await Promise.all([
    getLiquiditySummary(supabase, userId),
    getPlanningSummary(supabase, userId),
  ])

  return buildDashboardSummaryFromParts(liquidity, planning)
}
