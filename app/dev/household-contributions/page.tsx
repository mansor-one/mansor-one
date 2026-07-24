import Link from 'next/link'
import { notFound } from 'next/navigation'
import { evaluateInternalToolAccess } from '@/lib/auth/internal-tools'
import { requireUser } from '@/lib/auth/requireUser'
import {
  getHouseholdContributionPlanner,
  type ContributionAssignment,
  type HouseholdContributionScenario,
  type HouseholdContributionScenarioPlan,
  type TemporaryContributionIncomeInput,
} from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams?: Promise<{
    horizon?: string
    scenario?: string
    manuelAmount?: string
    manuelDate?: string
    sorayaAmount?: string
    sorayaDate?: string
    windfallAmount?: string
    windfallDate?: string
  }>
}

const SCENARIOS: Array<{
  id: HouseholdContributionScenario
  label: string
}> = [
  { id: 'responsibility', label: 'Responsibility-based' },
  { id: 'proportional', label: 'Proportional-income' },
  { id: 'hybrid', label: 'Hybrid' },
]

function money(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function parseAmount(value: string | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function parseHorizon(value: string | undefined): 7 | 14 | 30 {
  if (value === '7') return 7
  if (value === '30') return 30
  return 14
}

function parseScenario(
  value: string | undefined
): HouseholdContributionScenario {
  if (value === 'responsibility') return 'responsibility'
  if (value === 'proportional') return 'proportional'
  return 'hybrid'
}

function temporaryIncomeFromParams(
  params: Awaited<NonNullable<PageProps['searchParams']>>
): TemporaryContributionIncomeInput[] {
  return [
    {
      owner: 'manuel',
      name: 'Manuel scenario income',
      amount: parseAmount(params?.manuelAmount),
      expectedDate: params?.manuelDate,
      incomeType: 'paycheck',
      confidence: 'likely',
    },
    {
      owner: 'soraya',
      name: 'Soraya scenario income',
      amount: parseAmount(params?.sorayaAmount),
      expectedDate: params?.sorayaDate,
      incomeType: 'recurring',
      confidence: 'likely',
    },
    {
      owner: 'household',
      name: 'One-time household windfall',
      amount: parseAmount(params?.windfallAmount),
      expectedDate: params?.windfallDate,
      incomeType: 'windfall',
      confidence: 'likely',
    },
  ].filter(
    (income) => income.amount && income.expectedDate
  ) as TemporaryContributionIncomeInput[]
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function AssignmentCard({
  assignment,
}: {
  assignment: ContributionAssignment
}) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {assignment.incomeEventId.startsWith('temporary:')
              ? 'Scenario income'
              : 'Live income'}
          </p>
          <h3 className="mt-1 text-lg font-semibold capitalize">
            {assignment.person}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Income ${money(assignment.incomeAmount)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <MiniMetric
            label="Separate"
            value={`$${money(assignment.totalToSeparate)}`}
          />
          <MiniMetric
            label="Required"
            value={`$${money(assignment.requiredContribution)}`}
          />
          <MiniMetric
            label="Transfer"
            value={`$${money(assignment.transferToHouseholdAccount)}`}
          />
          <MiniMetric
            label="Remaining"
            value={`$${money(assignment.remainingAfterContribution)}`}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-800">
            Payments covered
          </p>
          {assignment.coveredPayments.length > 0 ? (
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {assignment.coveredPayments.map((payment) => (
                <li
                  className="flex flex-col gap-1 rounded border border-slate-200 bg-white p-2 md:flex-row md:items-center md:justify-between"
                  key={payment.paymentId}
                >
                  <span>
                    {payment.name} · due {payment.dueDate}
                  </span>
                  <span className="font-semibold">
                    ${money(payment.amountCovered)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              No payments assigned to this income event.
            </p>
          )}
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-800">Why</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {assignment.explanation.map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function PersonSection({
  title,
  assignments,
}: {
  title: string
  assignments: ContributionAssignment[]
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">{title}</h2>
      {assignments.length > 0 ? (
        <div className="space-y-3">
          {assignments.map((assignment) => (
            <AssignmentCard
              assignment={assignment}
              key={assignment.incomeEventId}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
          No assigned income events for {title}.
        </div>
      )}
    </section>
  )
}

function ScenarioSummary({
  plan,
}: {
  plan: HouseholdContributionScenarioPlan
}) {
  return (
    <section className="rounded-md border border-slate-300 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Selected scenario
          </p>
          <h2 className="mt-1 text-2xl font-bold">{plan.scenarioTitle}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            {plan.recommendationReason}
          </p>
        </div>
        {plan.recommended && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
            Recommended
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Metric
          label="To separate"
          value={`$${money(plan.householdSummary.totalToSeparate)}`}
        />
        <Metric
          label="Remaining"
          value={`$${money(plan.householdSummary.totalRemaining)}`}
        />
        <Metric
          label="Safe extra debt"
          value={`$${money(plan.safeExtraDebtAmount)}`}
        />
        <Metric
          label="Uncovered"
          value={`$${money(plan.uncoveredRequiredAmount)}`}
        />
      </div>
    </section>
  )
}

export default async function DevHouseholdContributionsPage({
  searchParams,
}: PageProps) {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const access = evaluateInternalToolAccess({
    surface: 'dev',
    userEmail: user.email,
  })

  if (!access.allowed) {
    notFound()
  }

  const params = (await searchParams) || {}
  const horizon = parseHorizon(params.horizon)
  const scenario = parseScenario(params.scenario)
  const temporaryIncome = temporaryIncomeFromParams(params)
  const result = await getHouseholdContributionPlanner(supabase, user.id, {
    horizonDays: horizon,
    selectedScenario: scenario,
    temporaryIncome,
  })
  const selectedPlan =
    result.plans.find((plan) => plan.scenario === result.selectedScenario) ||
    result.plans[0]

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-md border border-slate-300 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Read-only internal tool
              </p>
              <h1 className="mt-1 text-3xl font-bold">
                Household Contribution Planner
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
                Uses the Financial Engine snapshot to estimate how much Manuel
                and Soraya should separate from incoming money for upcoming
                obligations. This page does not move money, create transfers,
                mark payments paid, or write to the database.
              </p>
            </div>
            <Link
              className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              href="/dev/data-health"
            >
              Data Health
            </Link>
          </div>
        </section>

        <section className="rounded-md border border-slate-300 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Planner inputs</h2>
          <form className="mt-4 grid gap-4 lg:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700">Horizon</span>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                defaultValue={horizon}
                name="horizon"
              >
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700">Scenario</span>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                defaultValue={scenario}
                name="scenario"
              >
                {SCENARIOS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <button
                className="w-full rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                type="submit"
              >
                Refresh plan
              </button>
            </div>

            <ScenarioInput
              amountName="manuelAmount"
              amountValue={params.manuelAmount}
              dateName="manuelDate"
              dateValue={params.manuelDate}
              label="Manuel incoming"
            />
            <ScenarioInput
              amountName="sorayaAmount"
              amountValue={params.sorayaAmount}
              dateName="sorayaDate"
              dateValue={params.sorayaDate}
              label="Soraya incoming"
            />
            <ScenarioInput
              amountName="windfallAmount"
              amountValue={params.windfallAmount}
              dateName="windfallDate"
              dateValue={params.windfallDate}
              label="One-time windfall"
            />
          </form>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <Metric
            label="Cash available today"
            value={`$${money(selectedPlan.availableHouseholdCash)}`}
          />
          <Metric
            label="Income arriving"
            value={`$${money(selectedPlan.incomingIncomeTotal)}`}
          />
          <Metric
            label="Required obligations"
            value={`$${money(selectedPlan.requiredPaymentsTotal)}`}
          />
          <Metric
            label="Still uncovered"
            value={`$${money(selectedPlan.uncoveredRequiredAmount)}`}
          />
        </section>

        <ScenarioSummary plan={selectedPlan} />

        <section className="grid gap-3 md:grid-cols-3">
          {result.plans.map((plan) => (
            <Link
              className={`rounded-md border p-4 shadow-sm ${
                plan.scenario === selectedPlan.scenario
                  ? 'border-slate-950 bg-white'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
              href={`?horizon=${horizon}&scenario=${plan.scenario}`}
              key={plan.scenario}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">{plan.scenarioTitle}</h3>
                {plan.recommended && (
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                    Recommended
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Separate ${money(plan.householdSummary.totalToSeparate)} ·
                uncovered ${money(plan.uncoveredRequiredAmount)}
              </p>
            </Link>
          ))}
        </section>

        <PersonSection assignments={selectedPlan.manuel} title="Manuel" />
        <PersonSection assignments={selectedPlan.soraya} title="Soraya" />

        {selectedPlan.uncoveredPayments.length > 0 && (
          <section className="rounded-md border border-amber-300 bg-amber-50/60 p-5">
            <h2 className="text-lg font-semibold">Payments still uncovered</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-800">
              {selectedPlan.uncoveredPayments.map((payment) => (
                <li
                  className="flex flex-col gap-1 rounded-md border border-amber-200 bg-white p-3 md:flex-row md:items-center md:justify-between"
                  key={payment.paymentId}
                >
                  <span>
                    {payment.name} · due {payment.dueDate}
                  </span>
                  <span className="font-semibold">
                    ${money(payment.remainingAmount)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="grid gap-3 lg:grid-cols-2">
          <InfoList title="Assumptions" items={selectedPlan.assumptions} />
          <InfoList title="Missing data warnings" items={selectedPlan.warnings} />
        </section>
      </div>
    </main>
  )
}

function ScenarioInput({
  label,
  amountName,
  amountValue,
  dateName,
  dateValue,
}: {
  label: string
  amountName: string
  amountValue?: string
  dateName: string
  dateValue?: string
}) {
  return (
    <fieldset className="rounded-md border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold text-slate-700">
        {label}
      </legend>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Amount</span>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            defaultValue={amountValue || ''}
            min="0"
            name={amountName}
            step="0.01"
            type="number"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Date</span>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            defaultValue={dateValue || ''}
            name={dateName}
            type="date"
          />
        </label>
      </div>
    </fieldset>
  )
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-md border border-slate-300 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      {items.length > 0 ? (
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
          {items.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-600">No items to show.</p>
      )}
    </section>
  )
}
