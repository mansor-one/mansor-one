import { requireUser } from '@/lib/auth/requireUser'
import {
  type FinancialGoal,
  buildGoalSummary,
  sortGoalsByPriority,
} from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const sampleGoals: FinancialGoal[] = [
  {
    id: 'goal_emergency_fund',
    name: 'Emergency Fund',
    type: 'emergency_fund',
    priority: 'critical',
    status: 'active',
    strategy: 'fixed_monthly',
    targetAmount: 3000,
    targetDate: '2026-12-31',
    plannedMonthlyFunding: 250,
    notes: 'Base cash cushion for unexpected expenses.',
    fundingLedger: [
      {
        id: 'emergency_001',
        goalId: 'goal_emergency_fund',
        entryType: 'deposit',
        amount: 500,
        entryDate: '2026-06-01',
        source: 'manual',
        notes: 'Initial funding.',
      },
      {
        id: 'emergency_002',
        goalId: 'goal_emergency_fund',
        entryType: 'transfer_in',
        amount: 250,
        entryDate: '2026-06-15',
        source: 'manual',
        notes: 'Monthly transfer.',
      },
    ],
    milestones: [
      {
        id: 'emergency_milestone_001',
        name: 'First $1,000',
        targetAmount: 1000,
      },
      {
        id: 'emergency_milestone_002',
        name: 'One month cushion',
        targetAmount: 2000,
      },
    ],
    constraints: [
      {
        id: 'emergency_constraint_001',
        description: 'Keep funds liquid and separate from spending cash.',
        severity: 'info',
      },
    ],
  },
  {
    id: 'goal_crucero',
    name: 'Crucero',
    type: 'vacation',
    priority: 'medium',
    status: 'active',
    strategy: 'minimum_funding',
    targetAmount: 1800,
    targetDate: '2027-03-15',
    plannedMonthlyFunding: 150,
    notes: 'Vacation goal with steady monthly funding.',
    fundingLedger: [
      {
        id: 'crucero_001',
        goalId: 'goal_crucero',
        entryType: 'deposit',
        amount: 200,
        entryDate: '2026-06-10',
        source: 'manual',
      },
    ],
    milestones: [
      {
        id: 'crucero_milestone_001',
        name: 'Deposit ready',
        targetAmount: 500,
        targetDate: '2026-09-30',
      },
    ],
    constraints: [
      {
        id: 'crucero_constraint_001',
        description: 'Do not fund ahead of required bills.',
        severity: 'warning',
      },
    ],
  },
  {
    id: 'goal_toyota_paydown',
    name: 'Toyota Paydown',
    type: 'debt_reduction',
    priority: 'high',
    status: 'active',
    strategy: 'debt_avalanche',
    targetAmount: 5000,
    targetDate: '2027-06-30',
    plannedMonthlyFunding: 300,
    notes: 'Extra principal plan for vehicle debt reduction.',
    fundingLedger: [
      {
        id: 'toyota_001',
        goalId: 'goal_toyota_paydown',
        entryType: 'transfer_in',
        amount: 600,
        entryDate: '2026-06-20',
        source: 'manual',
        notes: 'Extra debt payment reserve.',
      },
    ],
    milestones: [
      {
        id: 'toyota_milestone_001',
        name: 'First $2,000 principal reduction',
        targetAmount: 2000,
      },
    ],
    constraints: [
      {
        id: 'toyota_constraint_001',
        description: 'Confirm payoff terms before large lump sum payment.',
        severity: 'info',
      },
    ],
  },
  {
    id: 'goal_team_share_debt_plan',
    name: 'Team Share Debt Plan',
    type: 'debt_reduction',
    priority: 'high',
    status: 'active',
    strategy: 'windfall_only',
    targetAmount: 16000,
    targetDate: '2027-03-31',
    plannedMonthlyFunding: 0,
    notes: 'Future scenario for expected Team Share bonus allocation.',
    fundingLedger: [],
    milestones: [
      {
        id: 'team_share_milestone_001',
        name: 'Confirm expected bonus amount',
        targetAmount: 16000,
        targetDate: '2027-02-28',
      },
    ],
    constraints: [
      {
        id: 'team_share_constraint_001',
        description: 'Do not count expected bonus as current cash.',
        severity: 'blocking',
      },
      {
        id: 'team_share_constraint_002',
        description: 'Ask before assuming debt allocation.',
        severity: 'warning',
      },
    ],
  },
]

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function money(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function percent(value: number) {
  return `${money(value)}%`
}

function optionalMoney(value: number | null) {
  return value === null ? 'N/A' : `$${money(value)}`
}

export default async function DevGoalsPage() {
  const { supabase } = await createServerSupabase()
  await requireUser(supabase)

  const goalSummaries = sortGoalsByPriority(sampleGoals).map((goal) =>
    buildGoalSummary(goal)
  )

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dev Goals</h1>
        <p className="text-sm opacity-70">
          Read-only Goal Engine v1 foundation using static sample goals.
        </p>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {goalSummaries.map((summary) => (
          <article
            className="border rounded p-4 space-y-4"
            key={summary.goal.id}
          >
            <div>
              <h2 className="text-xl font-bold">{summary.goal.name}</h2>
              <p className="text-sm opacity-70">
                {summary.goal.type} / {summary.goal.priority} /{' '}
                {summary.goal.strategy}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border rounded p-3">
                <h3 className="font-semibold">Target amount</h3>
                <p className="text-2xl font-bold">
                  ${money(summary.progress.targetAmount)}
                </p>
              </div>

              <div className="border rounded p-3">
                <h3 className="font-semibold">Calculated balance</h3>
                <p className="text-2xl font-bold">
                  ${money(summary.progress.balance)}
                </p>
              </div>

              <div className="border rounded p-3">
                <h3 className="font-semibold">Progress</h3>
                <p className="text-2xl font-bold">
                  {percent(summary.progress.progressPercent)}
                </p>
              </div>

              <div className="border rounded p-3">
                <h3 className="font-semibold">Remaining amount</h3>
                <p className="text-2xl font-bold">
                  ${money(summary.progress.remainingAmount)}
                </p>
              </div>

              <div className="border rounded p-3">
                <h3 className="font-semibold">Health</h3>
                <p className="text-2xl font-bold">{summary.health.status}</p>
                <p className="text-xs opacity-70">
                  Required monthly:{' '}
                  {optionalMoney(summary.health.requiredMonthlyFunding)}
                </p>
              </div>

              <div className="border rounded p-3">
                <h3 className="font-semibold">Confidence</h3>
                <p className="text-2xl font-bold">
                  {summary.confidence.score}%
                </p>
                <p className="text-xs opacity-70">
                  Estimated completion:{' '}
                  {summary.estimatedCompletionDate || 'Unknown'}
                </p>
              </div>
            </div>

            <section className="space-y-2">
              <h3 className="font-semibold">Funding ledger</h3>
              <div className="space-y-2">
                {summary.goal.fundingLedger.map((entry) => (
                  <div className="border rounded p-3 text-sm" key={entry.id}>
                    <p>
                      {entry.entryDate} / {entry.entryType} / $
                      {money(entry.amount)}
                    </p>
                    <p className="opacity-70">
                      Source: {entry.source}
                      {entry.notes ? ` / ${entry.notes}` : ''}
                    </p>
                  </div>
                ))}

                {summary.goal.fundingLedger.length === 0 && (
                  <p className="text-sm opacity-70">
                    No funding entries yet.
                  </p>
                )}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">Milestones</h3>
              <div className="space-y-2">
                {summary.goal.milestones.map((milestone) => (
                  <div
                    className="border rounded p-3 text-sm"
                    key={milestone.id}
                  >
                    <p>{milestone.name}</p>
                    <p className="opacity-70">
                      Target: ${money(milestone.targetAmount)}
                      {milestone.targetDate
                        ? ` / ${milestone.targetDate}`
                        : ''}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">Constraints</h3>
              <div className="space-y-2">
                {summary.goal.constraints.map((constraint) => (
                  <div
                    className="border rounded p-3 text-sm"
                    key={constraint.id}
                  >
                    <p>{constraint.description}</p>
                    <p className="opacity-70">
                      Severity: {constraint.severity}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </article>
        ))}
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Raw JSON</h2>
        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(goalSummaries)}
        </pre>
      </section>
    </main>
  )
}
