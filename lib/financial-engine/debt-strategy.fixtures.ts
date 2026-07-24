import {
  buildDebtStrategy,
  type DebtStrategyInsight,
} from './debt-strategy'
import type { PaymentInstance, PortfolioLiability, PortfolioSummary } from './types'

export type DebtStrategyFixtureOutput = Pick<
  DebtStrategyInsight,
  'type' | 'priority' | 'severity' | 'title' | 'evidence' | 'actionHref'
>

export type DebtStrategyFixtureScenario = {
  id: string
  title: string
  portfolio: Pick<
    PortfolioSummary,
    | 'liabilities'
    | 'totalCreditDebt'
    | 'totalCreditAvailable'
    | 'creditUtilizationPercent'
    | 'totalLiquidAvailable'
  >
  lifecyclePayments?: PaymentInstance[]
}

function creditCard(
  overrides: Partial<PortfolioLiability> & Pick<PortfolioLiability, 'id'>
): PortfolioLiability {
  return {
    source: 'manual',
    sourceId: overrides.id,
    name: 'Rewards Card',
    institution: 'Fixture Bank',
    liabilityType: 'credit_card',
    balance: 1000,
    minimumPayment: 50,
    dueDay: 15,
    apr: null,
    currency: 'USD',
    isManual: true,
    isConnected: false,
    metadata: {
      availableCredit: 1000,
    },
    ...overrides,
  }
}

function loan(
  overrides: Partial<PortfolioLiability> & Pick<PortfolioLiability, 'id'>
): PortfolioLiability {
  return {
    ...creditCard(overrides),
    name: 'Personal loan',
    liabilityType: 'loan' as PortfolioLiability['liabilityType'],
    metadata: {},
  }
}

function portfolio(
  liabilities: PortfolioLiability[],
  overrides: Partial<DebtStrategyFixtureScenario['portfolio']> = {}
): DebtStrategyFixtureScenario['portfolio'] {
  const totalCreditDebt = liabilities.reduce(
    (sum, liability) => sum + Number(liability.balance || 0),
    0
  )
  const totalCreditAvailable = liabilities.reduce((sum, liability) => {
    const available = liability.metadata.availableCredit
    return sum + (typeof available === 'number' ? available : 0)
  }, 0)
  const totalLimit = totalCreditDebt + totalCreditAvailable

  return {
    liabilities,
    totalCreditDebt,
    totalCreditAvailable,
    creditUtilizationPercent:
      totalLimit > 0 ? (totalCreditDebt / totalLimit) * 100 : 0,
    totalLiquidAvailable: 2500,
    ...overrides,
  }
}

function normalizeInsight(
  insight: DebtStrategyInsight
): DebtStrategyFixtureOutput {
  return {
    type: insight.type,
    priority: insight.priority,
    severity: insight.severity,
    title: insight.title,
    evidence: insight.evidence,
    actionHref: insight.actionHref,
  }
}

export const debtStrategyFixtureScenarios: DebtStrategyFixtureScenario[] = [
  {
    id: 'high-utilization-card',
    title: 'Card over 80% utilization',
    portfolio: portfolio([
      creditCard({
        id: 'card-high-utilization',
        name: 'Everyday Visa',
        balance: 4200,
        minimumPayment: 145,
        apr: 24.99,
        metadata: {
          availableCredit: 500,
        },
      }),
    ]),
  },
  {
    id: 'minimum-payment-due',
    title: 'Minimum payment due from lifecycle payment',
    portfolio: portfolio([
      creditCard({
        id: 'card-minimum-payment',
        name: 'Travel Mastercard',
        balance: 1800,
        minimumPayment: 75,
        dueDay: 12,
        metadata: {
          availableCredit: 2200,
        },
      }),
    ]),
    lifecyclePayments: [
      {
        id: 'payment-travel-mastercard',
        name: 'Travel Mastercard',
        amount: 75,
        status: 'pending',
        effective_due_date: '2026-07-12',
        lifecycleIsOpen: true,
        lifecycleLabel: 'Pending',
      },
    ],
  },
  {
    id: 'payoff-priority-with-apr',
    title: 'Payoff priority with APR available',
    portfolio: portfolio([
      creditCard({
        id: 'card-low-apr',
        name: 'Low APR Card',
        balance: 2500,
        apr: 12.99,
        metadata: {
          availableCredit: 2500,
        },
      }),
      creditCard({
        id: 'card-high-apr',
        name: 'High APR Card',
        balance: 900,
        apr: 28.99,
        metadata: {
          availableCredit: 1100,
        },
      }),
    ]),
  },
  {
    id: 'missing-apr-and-due-date',
    title: 'Missing APR and due date data',
    portfolio: portfolio([
      creditCard({
        id: 'card-missing-data',
        name: 'Unprofiled Card',
        balance: 1300,
        minimumPayment: null,
        dueDay: null,
        apr: null,
        metadata: {
          availableCredit: 1700,
        },
      }),
    ]),
  },
  {
    id: 'cash-risk-high',
    title: 'Cash risk blocks acceleration',
    portfolio: portfolio(
      [
        creditCard({
          id: 'card-buffer-pressure',
          name: 'Balance Card',
          balance: 2100,
          minimumPayment: 220,
          metadata: {
            availableCredit: 900,
          },
        }),
        loan({
          id: 'loan-personal',
          balance: 6000,
          minimumPayment: 280,
          dueDay: 20,
        }),
      ],
      {
        totalLiquidAvailable: 450,
      }
    ),
  },
]

export const debtStrategyFixtureResults = debtStrategyFixtureScenarios.map(
  (scenario) => {
    const result = buildDebtStrategy({
      portfolio: scenario.portfolio,
      lifecyclePayments: scenario.lifecyclePayments,
      generatedAt: '2026-07-09T12:00:00.000Z',
    })

    return {
      id: scenario.id,
      title: scenario.title,
      cashRisk: result.cashRisk,
      totals: result.totals,
      limitations: result.limitations,
      insights: result.insights.map(normalizeInsight),
    }
  }
)
