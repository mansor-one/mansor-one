export type GoalType =
  | 'emergency_fund'
  | 'debt_reduction'
  | 'vacation'
  | 'vehicle'
  | 'home'
  | 'education'
  | 'investment'
  | 'retirement'
  | 'family'
  | 'business'
  | 'custom'

export type GoalPriority =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'wishlist'

export type GoalStatus =
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'archived'

export type GoalStrategy =
  | 'fixed_monthly'
  | 'percentage_income'
  | 'windfall_only'
  | 'debt_avalanche'
  | 'debt_snowball'
  | 'minimum_funding'
  | 'custom'

export type GoalFundingEntryType =
  | 'deposit'
  | 'withdrawal'
  | 'adjustment'
  | 'transfer_in'
  | 'transfer_out'

export type GoalFundingSource =
  | 'manual'
  | 'quick_entry'
  | 'plaid_import'
  | 'windfall'
  | 'planning'
  | 'system'

export type GoalHealthStatus =
  | 'healthy'
  | 'at_risk'
  | 'delayed'
  | 'completed'
  | 'planned'
  | 'waiting_event'

export type GoalFundingEntry = {
  id: string
  goalId: string
  entryType: GoalFundingEntryType
  amount: number
  entryDate: string
  source: GoalFundingSource
  notes?: string | null
}

export type GoalMilestone = {
  id: string
  name: string
  targetAmount: number
  targetDate?: string | null
  completed?: boolean
}

export type GoalConstraint = {
  id: string
  description: string
  severity: 'info' | 'warning' | 'blocking'
}

export type FinancialGoal = {
  id: string
  name: string
  type: GoalType
  priority: GoalPriority
  status: GoalStatus
  strategy: GoalStrategy
  targetAmount: number
  targetDate?: string | null
  plannedMonthlyFunding?: number | null
  fundingLedger: GoalFundingEntry[]
  milestones: GoalMilestone[]
  constraints: GoalConstraint[]
  notes?: string | null
}

export type GoalProgress = {
  balance: number
  targetAmount: number
  remainingAmount: number
  progressPercent: number
}

export type GoalHealth = {
  status: GoalHealthStatus
  requiredMonthlyFunding: number | null
  plannedMonthlyFunding: number
  reasons: string[]
}

export type GoalConfidence = {
  score: number
  reasons: string[]
}

export type GoalSummary = {
  goal: FinancialGoal
  progress: GoalProgress
  health: GoalHealth
  confidence: GoalConfidence
  estimatedCompletionDate: string | null
}

const PRIORITY_ORDER: Record<GoalPriority, number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
  wishlist: 5,
}

function monthDiff(fromDate: Date, toDate: Date) {
  const years = toDate.getFullYear() - fromDate.getFullYear()
  const months = toDate.getMonth() - fromDate.getMonth()
  const dayAdjustment = toDate.getDate() >= fromDate.getDate() ? 0 : -1

  return Math.max(0, years * 12 + months + dayAdjustment)
}

function addMonths(date: Date, months: number) {
  const nextDate = new Date(date)
  nextDate.setMonth(nextDate.getMonth() + months)
  return nextDate
}

function dateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function calculateGoalBalance(entries: GoalFundingEntry[]) {
  return entries.reduce((balance, entry) => {
    const amount = Number(entry.amount || 0)

    if (entry.entryType === 'deposit' || entry.entryType === 'transfer_in') {
      return balance + Math.abs(amount)
    }

    if (
      entry.entryType === 'withdrawal' ||
      entry.entryType === 'transfer_out'
    ) {
      return balance - Math.abs(amount)
    }

    return balance + amount
  }, 0)
}

export function calculateGoalProgress(goal: FinancialGoal): GoalProgress {
  const balance = calculateGoalBalance(goal.fundingLedger)
  const targetAmount = Number(goal.targetAmount || 0)
  const remainingAmount = Math.max(targetAmount - balance, 0)
  const progressPercent =
    targetAmount > 0 ? Math.min((balance / targetAmount) * 100, 100) : 0

  return {
    balance,
    targetAmount,
    remainingAmount,
    progressPercent,
  }
}

export function calculateGoalHealth(
  goal: FinancialGoal,
  asOf: Date = new Date()
): GoalHealth {
  const progress = calculateGoalProgress(goal)
  const plannedMonthlyFunding = Number(goal.plannedMonthlyFunding || 0)
  const reasons: string[] = []

  if (progress.balance >= progress.targetAmount && progress.targetAmount > 0) {
    return {
      status: 'completed',
      requiredMonthlyFunding: 0,
      plannedMonthlyFunding,
      reasons: ['Goal balance has reached or exceeded target amount.'],
    }
  }

  const targetDate = goal.targetDate
    ? new Date(`${goal.targetDate}T00:00:00`)
    : null

  if (targetDate && targetDate < asOf) {
    return {
      status: 'delayed',
      requiredMonthlyFunding:
        goal.strategy === 'windfall_only' ? null : progress.remainingAmount,
      plannedMonthlyFunding,
      reasons: ['Target date has passed and goal is not completed.'],
    }
  }

  if (goal.strategy === 'windfall_only') {
    if (progress.balance <= 0) {
      return {
        status: targetDate ? 'waiting_event' : 'planned',
        requiredMonthlyFunding: null,
        plannedMonthlyFunding,
        reasons: ['Goal depends on a future windfall event, not monthly funding.'],
      }
    }

    return {
      status: 'planned',
      requiredMonthlyFunding: null,
      plannedMonthlyFunding,
      reasons: ['Windfall-only goal has funding progress recorded.'],
    }
  }

  const monthsRemaining = targetDate
    ? Math.max(monthDiff(asOf, targetDate), 1)
    : 0
  const requiredMonthlyFunding =
    monthsRemaining > 0 ? progress.remainingAmount / monthsRemaining : 0

  if (requiredMonthlyFunding > plannedMonthlyFunding) {
    reasons.push('Required monthly funding is higher than planned funding.')
    return {
      status: 'at_risk',
      requiredMonthlyFunding,
      plannedMonthlyFunding,
      reasons,
    }
  }

  reasons.push('Goal appears fundable under current assumptions.')
  return {
    status: 'healthy',
    requiredMonthlyFunding,
    plannedMonthlyFunding,
    reasons,
  }
}

export function calculateGoalConfidence(
  goal: FinancialGoal,
  asOf: Date = new Date()
): GoalConfidence {
  const progress = calculateGoalProgress(goal)
  const health = calculateGoalHealth(goal, asOf)
  const reasons: string[] = []
  let score = 50

  if (
    ['fixed_monthly', 'percentage_income', 'minimum_funding'].includes(
      goal.strategy
    ) &&
    Number(goal.plannedMonthlyFunding || 0) > 0
  ) {
    score += 20
    reasons.push('Recurring funding strategy exists.')
  }

  if (health.status === 'healthy' || health.status === 'completed') {
    score += 15
    reasons.push('Target date and funding plan look realistic.')
  }

  if (goal.fundingLedger.length === 0) {
    score -= 25
    reasons.push('No funding entries exist yet.')
  }

  const targetDate = goal.targetDate
    ? new Date(`${goal.targetDate}T00:00:00`)
    : null
  const monthsRemaining = targetDate ? monthDiff(asOf, targetDate) : null

  if (
    monthsRemaining !== null &&
    monthsRemaining <= 3 &&
    progress.progressPercent < 50
  ) {
    score -= 20
    reasons.push('Target date is close and progress is still low.')
  }

  if (goal.status !== 'active') {
    score -= 10
    reasons.push('Goal is not currently active.')
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
  }
}

export function estimateGoalCompletionDate(
  goal: FinancialGoal,
  asOf: Date = new Date()
) {
  const progress = calculateGoalProgress(goal)
  const plannedMonthlyFunding = Number(goal.plannedMonthlyFunding || 0)

  if (progress.remainingAmount <= 0) return dateString(asOf)
  if (plannedMonthlyFunding <= 0) return null

  const monthsNeeded = Math.ceil(
    progress.remainingAmount / plannedMonthlyFunding
  )

  return dateString(addMonths(asOf, monthsNeeded))
}

export function buildGoalSummary(
  goal: FinancialGoal,
  asOf: Date = new Date()
): GoalSummary {
  return {
    goal,
    progress: calculateGoalProgress(goal),
    health: calculateGoalHealth(goal, asOf),
    confidence: calculateGoalConfidence(goal, asOf),
    estimatedCompletionDate: estimateGoalCompletionDate(goal, asOf),
  }
}

export function sortGoalsByPriority(goals: FinancialGoal[]) {
  return [...goals].sort((a, b) => {
    const priorityDelta = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (priorityDelta !== 0) return priorityDelta
    return a.name.localeCompare(b.name)
  })
}
