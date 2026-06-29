import { getDashboardSummary } from './dashboard'
import { getPlanningSummary } from './planning'
import { getPortfolioSummary } from './portfolio'
import type {
  FinancialSummary,
  FinancialSummaryAlert,
  FinancialSummaryRecommendation,
  FinancialSummaryStatus,
  FinancialSupabaseClient,
  LiquiditySummary,
  PlanningSummary,
  PortfolioSummary,
} from './types'

const LOW_CASH_WARNING = 1000
const LOW_CASH_CRITICAL = 500
const HIGH_CREDIT_DEBT_WARNING = 5000
const HIGH_CREDIT_DEBT_CRITICAL = 8000
const HIGH_CREDIT_UTILIZATION_WARNING = 50
const HIGH_CREDIT_UTILIZATION_CRITICAL = 80
const MANY_REVIEW_ITEMS_THRESHOLD = 3

type SummaryInputs = {
  portfolio: PortfolioSummary
  liquidity: LiquiditySummary
  planning: PlanningSummary
  pendingReviewCount: number
}

export function getLiquidityStatus(
  availableToday: number,
  resultToday: number,
  resultAfterIncome: number
): FinancialSummaryStatus {
  if (resultAfterIncome < 0) return 'critical'
  if (resultToday < 0) return 'risk'
  if (availableToday < LOW_CASH_CRITICAL) return 'critical'
  if (availableToday < LOW_CASH_WARNING) return 'watch'
  if (availableToday >= 2000) return 'good'
  return 'stable'
}

export function getDebtStatus(
  totalCreditDebt: number,
  creditUtilizationPercent: number
): FinancialSummaryStatus {
  if (
    totalCreditDebt >= HIGH_CREDIT_DEBT_CRITICAL ||
    creditUtilizationPercent >= HIGH_CREDIT_UTILIZATION_CRITICAL
  ) {
    return 'critical'
  }

  if (
    totalCreditDebt >= HIGH_CREDIT_DEBT_WARNING ||
    creditUtilizationPercent >= HIGH_CREDIT_UTILIZATION_WARNING
  ) {
    return 'risk'
  }

  if (totalCreditDebt < 1000 && creditUtilizationPercent < 20) return 'good'
  return 'stable'
}

export function buildAlerts({
  portfolio,
  liquidity,
  planning,
  pendingReviewCount,
}: SummaryInputs): FinancialSummaryAlert[] {
  const alerts: FinancialSummaryAlert[] = []

  if (portfolio.totalLiquidAvailable < LOW_CASH_WARNING) {
    alerts.push({
      id: 'low_cash',
      severity:
        portfolio.totalLiquidAvailable < LOW_CASH_CRITICAL
          ? 'critical'
          : 'warning',
      title: 'Low cash',
      message: 'Available cash is below the preferred safety buffer.',
      metric: 'totalLiquidAvailable',
      value: portfolio.totalLiquidAvailable,
    })
  }

  if (liquidity.resultToday < 0) {
    alerts.push({
      id: 'negative_after_payments',
      severity: 'critical',
      title: 'Payments exceed available cash',
      message: 'Committed payments are not fully covered by available cash.',
      metric: 'resultToday',
      value: liquidity.resultToday,
    })
  }

  if (liquidity.resultAfterIncome < 0) {
    alerts.push({
      id: 'negative_after_income',
      severity: 'critical',
      title: 'Projected cash remains negative',
      message:
        'Available cash plus expected income still does not cover committed payments.',
      metric: 'resultAfterIncome',
      value: liquidity.resultAfterIncome,
    })
  }

  if (portfolio.totalCreditDebt >= HIGH_CREDIT_DEBT_WARNING) {
    alerts.push({
      id: 'high_credit_debt',
      severity:
        portfolio.totalCreditDebt >= HIGH_CREDIT_DEBT_CRITICAL
          ? 'critical'
          : 'warning',
      title: 'High credit debt',
      message: 'Credit card debt is above the preferred threshold.',
      metric: 'totalCreditDebt',
      value: portfolio.totalCreditDebt,
    })
  }

  if (
    portfolio.creditUtilizationPercent >= HIGH_CREDIT_UTILIZATION_WARNING
  ) {
    alerts.push({
      id: 'high_credit_utilization',
      severity:
        portfolio.creditUtilizationPercent >=
        HIGH_CREDIT_UTILIZATION_CRITICAL
          ? 'critical'
          : 'warning',
      title: 'High credit utilization',
      message: 'Credit utilization is elevated.',
      metric: 'creditUtilizationPercent',
      value: portfolio.creditUtilizationPercent,
    })
  }

  if (
    planning.totalFutureObligations > 0 &&
    planning.totalFutureObligations > portfolio.totalLiquidAvailable
  ) {
    alerts.push({
      id: 'planning_pressure',
      severity: 'warning',
      title: 'Planning obligations exceed available cash',
      message:
        'Open planning obligations are higher than current available cash.',
      metric: 'totalFutureObligations',
      value: planning.totalFutureObligations,
    })
  }

  if (pendingReviewCount >= MANY_REVIEW_ITEMS_THRESHOLD) {
    alerts.push({
      id: 'many_review_items',
      severity: 'info',
      title: 'Transactions need review',
      message: 'Several transactions are waiting for review.',
      metric: 'pendingReviewCount',
      value: pendingReviewCount,
    })
  }

  return alerts
}

export function buildRecommendations({
  portfolio,
  liquidity,
  planning,
  pendingReviewCount,
}: SummaryInputs): FinancialSummaryRecommendation[] {
  const recommendations: FinancialSummaryRecommendation[] = []

  if (pendingReviewCount > 0) {
    recommendations.push({
      id: 'review_transactions',
      actionType: 'review_transactions',
      priority: 10,
      title: 'Review pending transactions',
      message: 'Confirm pending transaction categories so reports stay clean.',
      reason: `${pendingReviewCount} transaction review items are pending.`,
    })
  }

  if (
    portfolio.totalLiquidAvailable < LOW_CASH_WARNING ||
    liquidity.resultToday < 0
  ) {
    recommendations.push({
      id: 'preserve_cash',
      actionType: 'preserve_cash',
      priority: 20,
      title: 'Preserve cash',
      message: 'Avoid extra spending until committed payments are covered.',
      reason: 'Available cash or projected cash after payments is low.',
    })
  }

  if (
    portfolio.totalCreditDebt >= HIGH_CREDIT_DEBT_WARNING ||
    portfolio.creditUtilizationPercent >= HIGH_CREDIT_UTILIZATION_WARNING
  ) {
    recommendations.push({
      id: 'pay_debt',
      actionType: 'pay_debt',
      priority: 30,
      title: 'Reduce credit debt',
      message: 'Prioritize reducing credit card balances.',
      reason: 'Credit debt or utilization is above the preferred threshold.',
    })
  }

  if (
    planning.totalFutureObligations > 0 &&
    planning.totalFutureObligations > portfolio.totalLiquidAvailable
  ) {
    recommendations.push({
      id: 'review_planning',
      actionType: 'review_planning',
      priority: 40,
      title: 'Review planning obligations',
      message: 'Revisit open planning items against current available cash.',
      reason: 'Future obligations exceed available cash.',
    })
  }

  if (liquidity.totalConfirmedIncome <= 0 || liquidity.resultToday < 0) {
    recommendations.push({
      id: 'check_income',
      actionType: 'check_income',
      priority: 50,
      title: 'Check upcoming income',
      message: 'Confirm expected income dates and amounts.',
      reason: 'Upcoming income is missing or needed to cover payments.',
    })
  }

  return recommendations.sort((a, b) => a.priority - b.priority)
}

export function buildBriefingLines({
  portfolio,
  liquidity,
  planning,
  pendingReviewCount,
}: SummaryInputs): string[] {
  const liquidityStatus = getLiquidityStatus(
    portfolio.totalLiquidAvailable,
    liquidity.resultToday,
    liquidity.resultAfterIncome
  )
  const debtStatus = getDebtStatus(
    portfolio.totalCreditDebt,
    portfolio.creditUtilizationPercent
  )
  const lines: string[] = []

  lines.push(`Today's liquidity is ${liquidityStatus}.`)

  if (liquidity.resultToday >= 0) {
    lines.push('Committed payments are fully covered.')
  } else if (liquidity.resultAfterIncome >= 0) {
    lines.push('Committed payments need expected income to stay covered.')
  } else {
    lines.push('Committed payments are not fully covered yet.')
  }

  if (debtStatus === 'stable') {
    lines.push('Credit card debt is in a stable range.')
  } else {
    lines.push('Credit card debt remains high.')
  }

  if (
    planning.totalFutureObligations > 0 &&
    planning.totalFutureObligations > portfolio.totalLiquidAvailable
  ) {
    lines.push('You have planning obligations exceeding available cash.')
  }

  if (pendingReviewCount > 0) {
    lines.push('Some transactions are waiting for review.')
  }

  return lines
}

function buildHealth({
  portfolio,
  liquidity,
  planning,
}: SummaryInputs): FinancialSummary['health'] {
  const liquidityStatus = getLiquidityStatus(
    portfolio.totalLiquidAvailable,
    liquidity.resultToday,
    liquidity.resultAfterIncome
  )
  const debtStatus = getDebtStatus(
    portfolio.totalCreditDebt,
    portfolio.creditUtilizationPercent
  )
  const strengths: string[] = []
  const risks: string[] = []

  if (portfolio.totalLiquidAvailable >= LOW_CASH_WARNING) {
    strengths.push('Available cash is above the basic safety buffer.')
  } else {
    risks.push('Available cash is below the basic safety buffer.')
  }

  if (liquidity.resultToday >= 0) {
    strengths.push('Committed payments are covered by available cash.')
  } else {
    risks.push('Committed payments exceed available cash.')
  }

  if (debtStatus === 'stable') {
    strengths.push('Credit debt is below the warning thresholds.')
  } else {
    risks.push('Credit debt or utilization is elevated.')
  }

  if (planning.totalFutureObligations > portfolio.totalLiquidAvailable) {
    risks.push('Planning obligations exceed available cash.')
  }

  return {
    cashAvailable: portfolio.totalLiquidAvailable,
    totalCreditDebt: portfolio.totalCreditDebt,
    totalLiabilities: portfolio.totalLiabilities,
    netWorth: portfolio.netWorth,
    creditUtilizationPercent: portfolio.creditUtilizationPercent,
    pendingActionPaymentTotal: liquidity.pendingActionPaymentTotal,
    initiatedPaymentsTotal: liquidity.initiatedPaymentsTotal,
    committedPaymentsTotal: liquidity.committedPaymentsTotal,
    pendingPaymentsTotal: liquidity.totalPendingPayments,
    planningObligationsTotal: planning.totalFutureObligations,
    liquidityStatus,
    debtStatus,
    strengths,
    risks,
  }
}

export async function getFinancialSummary(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<FinancialSummary> {
  const [portfolio, dashboard, planning] = await Promise.all([
    getPortfolioSummary(supabase, userId),
    getDashboardSummary(supabase, userId),
    getPlanningSummary(supabase, userId),
  ])
  const liquidity = dashboard.liquidity
  const pendingReviewCount = 0
  const inputs = {
    portfolio,
    liquidity,
    planning,
    pendingReviewCount,
  }
  const liquidityStatus = getLiquidityStatus(
    portfolio.totalLiquidAvailable,
    liquidity.resultToday,
    liquidity.resultAfterIncome
  )
  const debtStatus = getDebtStatus(
    portfolio.totalCreditDebt,
    portfolio.creditUtilizationPercent
  )

  return {
    generatedAt: new Date().toISOString(),
    userId,
    briefing: {
      availableToday: portfolio.totalLiquidAvailable,
      pendingActionPaymentTotal: liquidity.pendingActionPaymentTotal,
      initiatedPaymentsTotal: liquidity.initiatedPaymentsTotal,
      committedPaymentsTotal: liquidity.committedPaymentsTotal,
      pendingPaymentsTotal: liquidity.totalPendingPayments,
      upcomingIncomeTotal: liquidity.totalConfirmedIncome,
      resultToday: liquidity.resultToday,
      resultAfterIncome: liquidity.resultAfterIncome,
      netWorth: portfolio.netWorth,
      totalLiabilities: portfolio.totalLiabilities,
      totalCreditDebt: portfolio.totalCreditDebt,
      totalCreditAvailable: portfolio.totalCreditAvailable,
      pendingReviewCount,
      liquidityStatus,
      debtStatus,
      lines: buildBriefingLines(inputs),
    },
    dashboard: {
      liquidity: {
        availableToday: portfolio.totalLiquidAvailable,
        cashByInstitution: portfolio.cashByInstitution,
        pendingActionPaymentTotal: liquidity.pendingActionPaymentTotal,
        pendingActionPayments: liquidity.pendingActionPayments,
        initiatedPaymentsTotal: liquidity.initiatedPaymentsTotal,
        initiatedPayments: liquidity.initiatedPayments,
        committedPaymentsTotal: liquidity.committedPaymentsTotal,
        committedPayments: liquidity.committedPayments,
        pendingPaymentsTotal: liquidity.totalPendingPayments,
        pendingPayments: liquidity.pendingPayments,
        upcomingIncomeTotal: liquidity.totalConfirmedIncome,
        confirmedIncome: liquidity.confirmedIncome,
        resultToday: liquidity.resultToday,
        resultAfterIncome: liquidity.resultAfterIncome,
      },
      debt: {
        totalCreditDebt: portfolio.totalCreditDebt,
        manualCreditDebt: portfolio.manualCreditDebt,
        connectedCreditDebt: portfolio.connectedCreditDebt,
        totalCreditAvailable: portfolio.totalCreditAvailable,
        minimumPaymentsTotal: liquidity.manualMinimumPayments,
        creditDebtByInstitution: portfolio.creditDebtByInstitution,
        creditAvailableByInstitution:
          portfolio.creditAvailableByInstitution,
      },
      portfolio: {
        totalAssetBalance: portfolio.totalAssetBalance,
        totalLiabilities: portfolio.totalLiabilities,
        netWorth: portfolio.netWorth,
        assetAllocation: portfolio.assetAllocation,
        debtAllocation: portfolio.debtAllocation,
      },
      planning: {
        totalFutureObligations: planning.totalFutureObligations,
        planningItems: planning.planningItems,
      },
    },
    health: buildHealth(inputs),
    alerts: buildAlerts(inputs),
    recommendations: buildRecommendations(inputs),
    source: {
      portfolio,
      liquidity,
      planning,
      dashboard,
    },
  }
}
