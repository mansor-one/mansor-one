import type {
  FinancialSupabaseClient,
  PaymentInstance,
  PortfolioLiability,
  PortfolioSummary,
} from './types'
import { getLiquiditySummary } from './liquidity'
import { getPortfolioSummary } from './portfolio'
import { paymentRequiresUserAction } from '../finance/paymentLifecycle.ts'

export type DebtStrategyInsightType =
  | 'high_utilization'
  | 'minimum_payment_due'
  | 'payoff_priority'
  | 'cash_risk'
  | 'missing_apr'
  | 'missing_due_date'

export type DebtStrategySeverity = 'info' | 'warning' | 'critical'
export type DebtStrategyConfidence = 'low' | 'medium' | 'high'

export type DebtStrategyInsight = {
  id: string
  type: DebtStrategyInsightType
  priority: number
  severity: DebtStrategySeverity
  title: string
  recommendation: string
  explanation: string
  evidence: string[]
  confidence: DebtStrategyConfidence
  actionHref: string
  debtId?: string
}

export type DebtStrategyResult = {
  generatedAt: string
  cashRisk: {
    isHigh: boolean
    reason: string
  }
  totals: {
    totalCreditDebt: number
    totalCreditAvailable: number
    creditUtilizationPercent: number
    totalMinimumPayments: number
  }
  insights: DebtStrategyInsight[]
  limitations: string[]
}

export type DebtStrategyInputs = {
  portfolio: Pick<
    PortfolioSummary,
    | 'liabilities'
    | 'totalCreditDebt'
    | 'totalCreditAvailable'
    | 'creditUtilizationPercent'
    | 'totalLiquidAvailable'
  >
  lifecyclePayments?: PaymentInstance[]
  generatedAt?: string
}

const HIGH_UTILIZATION_PERCENT = 80
const NEAR_LIMIT_PERCENT = 90
const CASH_RISK_MINIMUM_BUFFER = 500
const CASH_RISK_MINIMUM_PAYMENT_RATIO = 0.5

function numeric(value: unknown) {
  return Number(value || 0)
}

function money(value: unknown) {
  return numeric(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function percent(value: unknown) {
  return `${Math.round(numeric(value))}%`
}

function debtName(debt: PortfolioLiability) {
  return [debt.institution, debt.name].filter(Boolean).join(' - ') || 'Debt'
}

function debtApr(debt: PortfolioLiability) {
  if (debt.apr === null || debt.apr === undefined || debt.apr === '') {
    return null
  }

  const value = Number(debt.apr)
  return Number.isFinite(value) ? value : null
}

function availableCredit(debt: PortfolioLiability) {
  const metadataAvailable = debt.metadata.availableCredit
  if (typeof metadataAvailable === 'number') return metadataAvailable

  const metadataAvailableBalance = debt.metadata.available_balance
  if (typeof metadataAvailableBalance === 'number') {
    return metadataAvailableBalance
  }

  return null
}

function utilizationPercent(debt: PortfolioLiability) {
  const available = availableCredit(debt)
  const balance = numeric(debt.balance)

  if (available === null) return null

  const limit = balance + available
  if (limit <= 0) return null

  return (balance / limit) * 100
}

function paymentDate(payment: PaymentInstance) {
  return payment.effective_due_date || payment.due_date || payment.expected_date || ''
}

function isOpenPayment(payment: PaymentInstance) {
  return paymentRequiresUserAction(payment)
}

function matchesDebtPayment(debt: PortfolioLiability, payment: PaymentInstance) {
  const debtSignals = [
    debt.name,
    debt.institution,
    debt.sourceId,
    debt.metadata.scheduledPaymentId,
    debt.metadata.scheduled_payment_id,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const paymentSignals = [
    payment.name,
    payment.scheduled_payment_id,
    payment.notes,
    payment.displayNotes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return Boolean(
    debtSignals &&
      paymentSignals &&
      (debtSignals.includes(paymentSignals) ||
        paymentSignals.includes(debtSignals) ||
        String(debt.sourceId || '') === String(payment.scheduled_payment_id || ''))
  )
}

function nextPaymentForDebt(
  debt: PortfolioLiability,
  lifecyclePayments: PaymentInstance[]
) {
  return lifecyclePayments
    .filter(isOpenPayment)
    .filter((payment) => matchesDebtPayment(debt, payment))
    .sort((a, b) => paymentDate(a).localeCompare(paymentDate(b)))[0] || null
}

function totalMinimumPayments(liabilities: PortfolioLiability[]) {
  return liabilities.reduce(
    (sum, liability) => sum + numeric(liability.minimumPayment),
    0
  )
}

function cashRiskReason({
  availableCash,
  minimumPayments,
}: {
  availableCash: number
  minimumPayments: number
}) {
  if (availableCash < CASH_RISK_MINIMUM_BUFFER) {
    return `Available cash is below $${money(CASH_RISK_MINIMUM_BUFFER)}.`
  }

  if (
    minimumPayments > 0 &&
    availableCash <= minimumPayments * (1 + CASH_RISK_MINIMUM_PAYMENT_RATIO)
  ) {
    return 'Available cash is close to the known minimum payment load.'
  }

  return 'Available cash is not showing high debt-payment pressure.'
}

function payoffPriorityScore(debt: PortfolioLiability) {
  const apr = debtApr(debt)
  const utilization = utilizationPercent(debt)
  const minimumPayment = numeric(debt.minimumPayment)
  const balance = numeric(debt.balance)

  if (apr !== null) return apr * 1000 + balance / 100

  return (
    numeric(utilization) * 20 +
    Math.min(balance / 100, 100) +
    Math.min(minimumPayment, 100)
  )
}

function payoffPriorityDebt(liabilities: PortfolioLiability[]) {
  return [...liabilities]
    .filter((debt) => numeric(debt.balance) > 0)
    .sort((a, b) => payoffPriorityScore(b) - payoffPriorityScore(a))[0] || null
}

function isLoanLike(debt: PortfolioLiability) {
  return debt.liabilityType !== 'credit_card'
}

export function buildDebtStrategy({
  portfolio,
  lifecyclePayments = [],
  generatedAt = new Date().toISOString(),
}: DebtStrategyInputs): DebtStrategyResult {
  const liabilities = portfolio.liabilities.filter(
    (liability) => numeric(liability.balance) > 0
  )
  const minimumPayments = totalMinimumPayments(liabilities)
  const cashRisk = {
    isHigh:
      portfolio.totalLiquidAvailable < CASH_RISK_MINIMUM_BUFFER ||
      (minimumPayments > 0 &&
        portfolio.totalLiquidAvailable <=
          minimumPayments * (1 + CASH_RISK_MINIMUM_PAYMENT_RATIO)),
    reason: cashRiskReason({
      availableCash: portfolio.totalLiquidAvailable,
      minimumPayments,
    }),
  }
  const insights: DebtStrategyInsight[] = []
  const limitations = [
    'Debt Strategy v1 does not run avalanche or snowball simulations yet.',
  ]

  if (liabilities.length === 0) {
    limitations.push('Portfolio Summary has no positive debt balances.')
  }

  liabilities.forEach((debt) => {
    const name = debtName(debt)
    const utilization = utilizationPercent(debt)
    const apr = debtApr(debt)
    const nextPayment = nextPaymentForDebt(debt, lifecyclePayments)

    if (utilization !== null && utilization >= HIGH_UTILIZATION_PERCENT) {
      insights.push({
        id: `high_utilization:${debt.id}`,
        type: 'high_utilization',
        priority: utilization >= NEAR_LIMIT_PERCENT ? 92 : 84,
        severity: utilization >= NEAR_LIMIT_PERCENT ? 'critical' : 'warning',
        title: `${name} utilization is high`,
        recommendation:
          'Avoid adding new charges and prioritize lowering this balance.',
        explanation:
          'The card is above the preferred utilization threshold from Portfolio-derived debt data.',
        evidence: [
          `Utilization: ${percent(utilization)}`,
          `Balance: $${money(debt.balance)}`,
          `Available credit: $${money(availableCredit(debt))}`,
        ],
        confidence: 'high',
        actionHref: '/portfolio#plaid-accounts',
        debtId: debt.id,
      })
    }

    if (nextPayment || numeric(debt.minimumPayment) > 0) {
      const paymentAmount = nextPayment?.amount ?? debt.minimumPayment
      insights.push({
        id: `minimum_payment_due:${debt.id}`,
        type: 'minimum_payment_due',
        priority: nextPayment?.isOverdue ? 96 : 78,
        severity: nextPayment?.isOverdue ? 'critical' : 'warning',
        title: `${name} has a payment to protect`,
        recommendation:
          'Keep the minimum payment covered before accelerating payoff.',
        explanation:
          'Debt Strategy v1 uses lifecycle payment context when available, then known minimum payment data.',
        evidence: [
          `Minimum/payment amount: $${money(paymentAmount)}`,
          nextPayment?.effective_due_date
            ? `Due date: ${nextPayment.effective_due_date}`
            : `Due day: ${debt.dueDay || 'not set'}`,
          `Status: ${nextPayment?.lifecycleLabel || nextPayment?.status || 'scheduled'}`,
        ],
        confidence: nextPayment ? 'high' : 'medium',
        actionHref: '/timeline#payments',
        debtId: debt.id,
      })
    }

    if (apr === null) {
      insights.push({
        id: `missing_apr:${debt.id}`,
        type: 'missing_apr',
        priority: 46,
        severity: 'info',
        title: `${name} is missing APR data`,
        recommendation:
          'Add APR before relying on interest-first payoff ranking.',
        explanation:
          'Without APR, the strategy falls back to utilization, balance, and minimum payment pressure.',
        evidence: [
          `Balance: $${money(debt.balance)}`,
          utilization === null
            ? 'Utilization: unavailable'
            : `Utilization: ${percent(utilization)}`,
        ],
        confidence: 'high',
        actionHref: '/portfolio#manual-accounts',
        debtId: debt.id,
      })
    }

    if (!debt.dueDay && !nextPayment?.effective_due_date) {
      insights.push({
        id: `missing_due_date:${debt.id}`,
        type: 'missing_due_date',
        priority: 44,
        severity: 'info',
        title: `${name} is missing due date data`,
        recommendation:
          'Add a due day or link the debt to a payment schedule.',
        explanation:
          'Debt Strategy v1 cannot reason about payment timing without a due date or lifecycle payment.',
        evidence: [
          `Minimum payment: ${
            debt.minimumPayment === null || debt.minimumPayment === undefined
              ? 'not set'
              : `$${money(debt.minimumPayment)}`
          }`,
          'Payment timing: unavailable',
        ],
        confidence: 'high',
        actionHref: '/portfolio#manual-accounts',
        debtId: debt.id,
      })
    }

    if (cashRisk.isHigh && isLoanLike(debt)) {
      insights.push({
        id: `cash_risk:${debt.id}`,
        type: 'cash_risk',
        priority: 88,
        severity: 'warning',
        title: `${name} should not be accelerated right now`,
        recommendation:
          'Protect cash and pay only the required amount until cash pressure clears.',
        explanation:
          'Acceleration is not recommended when the engine shows high cash risk.',
        evidence: [
          cashRisk.reason,
          `Available cash: $${money(portfolio.totalLiquidAvailable)}`,
          `Known minimum payments: $${money(minimumPayments)}`,
        ],
        confidence: 'medium',
        actionHref: '/portfolio#manual-accounts',
        debtId: debt.id,
      })
    }
  })

  const priorityDebt = payoffPriorityDebt(liabilities)
  if (priorityDebt) {
    const apr = debtApr(priorityDebt)
    const utilization = utilizationPercent(priorityDebt)
    insights.push({
      id: `payoff_priority:${priorityDebt.id}`,
      type: 'payoff_priority',
      priority: apr === null ? 72 : 90,
      severity: apr === null ? 'info' : 'warning',
      title: `${debtName(priorityDebt)} is the top payoff candidate`,
      recommendation: cashRisk.isHigh
        ? 'Cover minimums first; revisit extra payoff after cash pressure clears.'
        : 'Use this as the first extra-payoff target.',
      explanation: apr === null
        ? 'APR is missing, so the fallback ranking uses utilization, balance, and minimum payment.'
        : 'APR is available, so the strategy prioritizes the highest-interest debt first.',
      evidence: [
        apr === null ? 'APR: missing' : `APR: ${percent(apr)}`,
        utilization === null
          ? 'Utilization: unavailable'
          : `Utilization: ${percent(utilization)}`,
        `Balance: $${money(priorityDebt.balance)}`,
      ],
      confidence: apr === null ? 'medium' : 'high',
      actionHref: '/portfolio#plaid-accounts',
      debtId: priorityDebt.id,
    })
  }

  if (cashRisk.isHigh) {
    insights.push({
      id: 'cash_risk:minimum-payment-buffer',
      type: 'cash_risk',
      priority: 86,
      severity: 'warning',
      title: 'Cash buffer is tight for debt acceleration',
      recommendation:
        'Keep extra debt payoff paused until minimum payments and household cash are protected.',
      explanation:
        'Debt Strategy v1 does not accelerate payoff when cash risk is high.',
      evidence: [
        cashRisk.reason,
        `Available cash: $${money(portfolio.totalLiquidAvailable)}`,
        `Known minimum payments: $${money(minimumPayments)}`,
      ],
      confidence: 'high',
      actionHref: '/timeline#projection',
    })
  }

  if (
    portfolio.totalCreditDebt > 0 &&
    liabilities.every((debt) => debtApr(debt) === null)
  ) {
    limitations.push('Portfolio liabilities do not currently expose APR values.')
  }

  if (liabilities.every((debt) => debt.liabilityType === 'credit_card')) {
    limitations.push('Loan acceleration strategy is ready for future loan liability types, but Portfolio currently exposes credit card liabilities only.')
  }

  return {
    generatedAt,
    cashRisk,
    totals: {
      totalCreditDebt: portfolio.totalCreditDebt,
      totalCreditAvailable: portfolio.totalCreditAvailable,
      creditUtilizationPercent: portfolio.creditUtilizationPercent,
      totalMinimumPayments: minimumPayments,
    },
    insights: insights
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority
        return a.id.localeCompare(b.id)
      })
      .slice(0, 10),
    limitations,
  }
}

export async function getDebtStrategy(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<DebtStrategyResult> {
  const [portfolio, liquidity] = await Promise.all([
    getPortfolioSummary(supabase, userId),
    getLiquiditySummary(supabase, userId),
  ])

  return buildDebtStrategy({
    portfolio,
    lifecyclePayments: liquidity.lifecyclePayments,
  })
}
