import type {
  FinancialSupabaseClient,
  PlanningItem,
  PlanningSummary,
} from './types'

export async function getPlanningSummary(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<PlanningSummary> {
  const { data, error } = await supabase
    .from('planning_items')
    .select('*')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .eq('is_completed', false)
    .order('due_date', { ascending: true })
    .limit(5)

  if (error) throw error

  const planningItems = (data || []) as PlanningItem[]
  const totalFutureObligations = planningItems.reduce(
    (sum, item) => sum + Number(item.target_amount || 0),
    0
  )

  return {
    planningItems,
    totalFutureObligations,
  }
}
