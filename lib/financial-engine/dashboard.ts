import { getLiquiditySummary } from './liquidity'
import { getPlanningSummary } from './planning'
import type { DashboardSummary, FinancialSupabaseClient } from './types'

export async function getDashboardSummary(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<DashboardSummary> {
  const [liquidity, planning] = await Promise.all([
    getLiquiditySummary(supabase, userId),
    getPlanningSummary(supabase, userId),
  ])

  return {
    liquidity,
    planning,
  }
}
