import {
  buildMansorDecisionsV1FromSnapshot,
  type MansorDecision,
} from './decision-engine-v1'
import type { FinancialEngineSnapshot } from './snapshot'
import type { PaymentInstance, PlanningItem } from './types'
import type { TimelineProjectionEvent } from './timeline'

export type DecisionEngineV1FixtureOutput = Pick<
  MansorDecision,
  'type' | 'priority' | 'severity' | 'title' | 'evidence' | 'actionHref'
>

export type DecisionEngineV1FixtureScenario = {
  id: string
  title: string
  snapshot: FinancialEngineSnapshot
}

const GENERATED_AT = '2026-07-09T12:00:00.000Z'

function payment(
  overrides: Partial<PaymentInstance> & Pick<PaymentInstance, 'id' | 'name'>
): PaymentInstance {
  return {
    amount: 100,
    status: 'pending',
    lifecycleIsOpen: true,
    lifecycleIsClosed: false,
    lifecycleLabel: 'Pending',
    ...overrides,
  }
}

function timelinePayment(
  overrides: Partial<TimelineProjectionEvent>
): TimelineProjectionEvent {
  return {
    date: '2026-07-10',
    title: 'Mortgage',
    amount: -1200,
    type: 'payment',
    status: 'pending',
    notes: '',
    dueDate: '2026-07-10',
    graceUntilDate: null,
    isInGracePeriod: false,
    balanceAfter: -300,
    ...overrides,
  }
}

function fund(overrides: Partial<PlanningItem> & Pick<PlanningItem, 'id'>) {
  return {
    name: 'Emergency fund',
    target_amount: 1000,
    current_amount: 0,
    item_type: 'fund',
    is_archived: false,
    is_completed: false,
    ...overrides,
  }
}

function snapshot(
  overrides: Partial<FinancialEngineSnapshot>
): FinancialEngineSnapshot {
  const base = {
    generatedAt: GENERATED_AT,
    dashboard: {
      liquidity: {},
      planning: {},
    },
    liquidity: {
      lifecyclePayments: [],
      projectedIncome: [],
      connectedAccounts: [],
      resultToday: 1200,
      resultAfterIncome: 1200,
    },
    lifecyclePayments: [],
    projectedIncome: [],
    timeline: {
      startingCash: 1200,
      finalBalance: 1200,
      minimumBalance: 1200,
      events: [],
      explanation: {
        initialCash: {
          balance: 1200,
          connectedCash: 1200,
          manualCash: 0,
          text: 'Fixture cash.',
        },
        lowestPoint: {
          date: null,
          balance: 1200,
          payments: [],
          incomeEvents: [],
          text: 'Fixture has no projected pressure.',
        },
        finalBalance: {
          balance: 1200,
          totalIncome: 0,
          totalPayments: 0,
          openCommitmentsCount: 0,
          incomeEventsCount: 0,
          text: 'Fixture final balance.',
        },
      },
    },
    portfolio: {
      totalLiquidAvailable: 1200,
    },
    planning: {
      planningItems: [],
      totalFutureObligations: 0,
    },
    financialSummary: {},
    decisionEngineV1: [],
    reviewQueue: {
      statistics: {
        totalCandidates: 0,
        autoConfirmable: 0,
        manualReviewCount: 0,
        duplicateCount: 0,
        athCount: 0,
        paymentMatches: 0,
      },
      readyToConfirmCount: 0,
      needsCategoryCount: 0,
      possibleDuplicateCount: 0,
      athReviewCount: 0,
      paymentConfirmationCount: 0,
      needsManualReviewCount: 0,
    },
  } as unknown as FinancialEngineSnapshot

  return {
    ...base,
    ...overrides,
    liquidity: {
      ...base.liquidity,
      ...overrides.liquidity,
    },
    timeline: {
      ...base.timeline,
      ...overrides.timeline,
      explanation: {
        ...base.timeline.explanation,
        ...overrides.timeline?.explanation,
        lowestPoint: {
          ...base.timeline.explanation.lowestPoint,
          ...overrides.timeline?.explanation?.lowestPoint,
        },
      },
    },
    portfolio: {
      ...base.portfolio,
      ...overrides.portfolio,
    },
    planning: {
      ...base.planning,
      ...overrides.planning,
    },
    reviewQueue: {
      ...base.reviewQueue,
      ...overrides.reviewQueue,
      statistics: {
        ...base.reviewQueue.statistics,
        ...overrides.reviewQueue?.statistics,
      },
    },
  }
}

function normalizeDecision(
  decision: MansorDecision
): DecisionEngineV1FixtureOutput {
  return {
    type: decision.type,
    priority: decision.priority,
    severity: decision.severity,
    title: decision.title,
    evidence: decision.evidence,
    actionHref: decision.actionHref,
  }
}

export const decisionEngineV1FixtureScenarios: DecisionEngineV1FixtureScenario[] = [
  {
    id: 'overdue-payment',
    title: 'Overdue payment',
    snapshot: snapshot({
      lifecyclePayments: [
        payment({
          id: 'payment-internet-overdue',
          name: 'Internet',
          amount: 89,
          effective_due_date: '2026-07-07',
          isOverdue: true,
          lifecycleLabel: 'Overdue',
        }),
      ],
    }),
  },
  {
    id: 'due-soon-no-grace',
    title: 'Due soon with no grace',
    snapshot: snapshot({
      lifecyclePayments: [
        payment({
          id: 'payment-water-due-soon',
          name: 'Water',
          amount: 140,
          effective_due_date: '2026-07-11',
          grace_days: 0,
        }),
      ],
    }),
  },
  {
    id: 'grace-income-before-grace',
    title: 'Grace period with income before grace_until',
    snapshot: snapshot({
      lifecyclePayments: [
        payment({
          id: 'payment-car-grace',
          name: 'Car payment',
          amount: 425,
          effective_due_date: '2026-07-08',
          grace_until: '2026-07-15',
          grace_days: 7,
          isInGracePeriod: true,
          lifecycleLabel: 'In grace',
        }),
      ],
      projectedIncome: [
        {
          id: 'income-payroll',
          name: 'Payroll',
          amount: 2200,
          next_expected_date: '2026-07-12',
          status: 'expected',
          confidence: 'confirmed',
          is_active: true,
        },
      ],
      liquidity: {
        projectedIncome: [
          {
            id: 'income-payroll',
            name: 'Payroll',
            amount: 2200,
            next_expected_date: '2026-07-12',
            status: 'expected',
            confidence: 'confirmed',
            is_active: true,
          },
        ],
      } as FinancialEngineSnapshot['liquidity'],
    }),
  },
  {
    id: 'negative-timeline-low-point',
    title: 'Negative timeline low point',
    snapshot: snapshot({
      timeline: {
        minimumBalance: -9304,
        explanation: {
          lowestPoint: {
            date: '2026-07-12',
            balance: -9304,
            payments: [
              timelinePayment({
                title: 'Mortgage',
                amount: -2500,
                balanceAfter: -9304,
              }),
              timelinePayment({
                title: 'Insurance',
                amount: -950,
                balanceAfter: -9304,
              }),
            ],
            incomeEvents: [],
            text: 'Fixture low point after large payments.',
          },
        },
      } as unknown as FinancialEngineSnapshot['timeline'],
    }),
  },
  {
    id: 'stale-account-warning',
    title: 'Stale account warning',
    snapshot: snapshot({
      liquidity: {
        connectedAccounts: [
          {
            id: 'account-checking',
            institution_name: 'FirstBank',
            name: 'Everyday Checking',
            updated_at: '2026-07-06T08:00:00.000Z',
          },
        ],
      } as FinancialEngineSnapshot['liquidity'],
    }),
  },
  {
    id: 'review-queue-backlog',
    title: 'Review queue backlog',
    snapshot: snapshot({
      reviewQueue: {
        statistics: {
          totalCandidates: 9,
          autoConfirmable: 2,
          manualReviewCount: 7,
          duplicateCount: 3,
          athCount: 1,
          paymentMatches: 2,
        },
        possibleDuplicateCount: 3,
        needsCategoryCount: 2,
      } as FinancialEngineSnapshot['reviewQueue'],
    }),
  },
  {
    id: 'planning-fund-opportunity',
    title: 'Planning fund opportunity',
    snapshot: snapshot({
      planning: {
        planningItems: [
          fund({
            id: 'fund-emergency',
            name: 'Emergency fund',
            target_amount: 1000,
            current_amount: 930,
          }),
        ],
        totalFutureObligations: 1000,
      },
      portfolio: {
        totalLiquidAvailable: 5000,
      } as FinancialEngineSnapshot['portfolio'],
    }),
  },
]

export const decisionEngineV1FixtureResults =
  decisionEngineV1FixtureScenarios.map((scenario) => ({
    id: scenario.id,
    title: scenario.title,
    decisions: buildMansorDecisionsV1FromSnapshot(scenario.snapshot).map(
      normalizeDecision
    ),
  }))
