import { requireUser } from '@/lib/auth/requireUser'
import AppShell from '@/app/components/AppShell'
import { getRobototinaContext } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'
import type { MansorDecision } from '@/lib/financial-engine'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Robototina | Mansor One',
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fallback(value: string | null | undefined, label = 'N/A') {
  return value || label
}

function confidenceLabel(level: string) {
  if (level === 'high') return 'Alta'
  if (level === 'medium') return 'Media'
  return 'Baja'
}

function decisionStyle(decision: MansorDecision) {
  if (decision.severity === 'critical') {
    return {
      accent: 'border-l-red-500',
      icon: '!',
      iconClass: 'bg-red-50 text-red-700 border-red-100',
      badgeClass: 'bg-red-50 text-red-700 border-red-100',
    }
  }

  if (decision.severity === 'warning') {
    return {
      accent: 'border-l-amber-500',
      icon: '!',
      iconClass: 'bg-amber-50 text-amber-700 border-amber-100',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-100',
    }
  }

  if (decision.type === 'opportunity') {
    return {
      accent: 'border-l-emerald-500',
      icon: '+',
      iconClass: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    }
  }

  if (decision.type === 'planning') {
    return {
      accent: 'border-l-sky-500',
      icon: 'P',
      iconClass: 'bg-sky-50 text-sky-700 border-sky-100',
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-100',
    }
  }

  return {
    accent: 'border-l-slate-400',
    icon: 'i',
    iconClass: 'bg-slate-50 text-slate-700 border-slate-100',
    badgeClass: 'bg-slate-50 text-slate-700 border-slate-100',
  }
}

function decisionLabel(type: string) {
  if (type === 'pay_now') return 'Payment action'
  if (type === 'review_needed') return 'Review needed'
  if (type === 'opportunity') return 'Opportunity'
  if (type === 'planning') return 'Planning'
  if (type === 'wait') return 'Timing'
  return 'Risk'
}

function decisionGroups(decisions: MansorDecision[]) {
  return [
    {
      title: 'Critical',
      description: 'Handle these first.',
      decisions: decisions.filter((decision) => decision.severity === 'critical'),
    },
    {
      title: 'Warnings',
      description: 'Watch timing, cash pressure, or data quality.',
      decisions: decisions.filter((decision) => decision.severity === 'warning'),
    },
    {
      title: 'Planning Opportunities',
      description: 'Useful next moves when the urgent items are covered.',
      decisions: decisions.filter((decision) => decision.severity === 'info'),
    },
  ].filter((group) => group.decisions.length > 0)
}

function advisorTitle(decision: MansorDecision) {
  if (decision.type === 'pay_now') return decision.title.replace(' is ', ' payment is ')
  return decision.title
}

function summaryIncomeLine(decisions: MansorDecision[]) {
  const incomeDecision = decisions.find((decision) =>
    decision.id.startsWith('income-upcoming:')
  )

  if (!incomeDecision) return 'No expected income signal this week'
  return incomeDecision.evidence[0] || 'Expected income signal this week'
}

export default async function RobototinaPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const context = await getRobototinaContext(supabase, user.id)
  const overduePayments = context.liquidity.openPayments.filter(
    (payment) => payment.isOverdue
  )
  const groupedDecisions = decisionGroups(context.decisions)

  return (
    <AppShell
      header={{
        eyebrow: 'Asesora familiar',
        title: 'Robototina',
        subtitle:
          'La lectura tranquila de hoy: qué atender, qué puede esperar y qué conviene planificar.',
        secondaryAction: (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Actualizado {new Date(context.generatedAt).toLocaleString('es-PR')}
          </div>
        ),
      }}
    >

      <section className="mx-auto mt-5 grid max-w-7xl grid-cols-1 gap-3 md:grid-cols-4">
        <KpiCard
          label="Today's Cash"
          value={`$${money(context.liquidity.availableCash)}`}
          helper="Available for today's decisions"
        />
        <KpiCard
          label="Upcoming Risk"
          value={`$${money(context.timeline.lowestPointBalance)}`}
          helper={`Lowest projected balance ${context.timeline.lowestPointDate || 'in timeline'}`}
        />
        <KpiCard
          label="Expected Income"
          value={`$${money(context.liquidity.projectedIncomeTotal)}`}
          helper="Projected by the engine"
        />
        <KpiCard
          label="Net Worth"
          value={`$${money(context.portfolio.netWorth)}`}
          helper="Assets minus liabilities"
        />
      </section>

      <section className="mx-auto mt-5 grid max-w-7xl grid-cols-1 gap-5 lg:grid-cols-[0.9fr_1.6fr]">
        <div className="space-y-5">
          <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-500">Today you have</p>
                <h2 className="text-xl font-semibold">Financial brief</h2>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                Live context
              </span>
            </div>
            <ul className="space-y-3 text-sm text-slate-700">
              <SummaryItem
                label={`${overduePayments.length} overdue payment${overduePayments.length === 1 ? '' : 's'}`}
              />
              <SummaryItem
                label={`${context.liquidity.gracePeriodPayments.length} payment${context.liquidity.gracePeriodPayments.length === 1 ? '' : 's'} inside grace period`}
              />
              <SummaryItem
                label={`Lowest projected balance: $${money(context.timeline.lowestPointBalance)}`}
              />
              <SummaryItem label={summaryIncomeLine(context.decisions)} />
            </ul>
          </section>

          <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">What Robototina is watching</h2>
            <div className="mt-4 space-y-3">
              {context.insights.slice(0, 4).map((insight) => (
                <a
                  key={insight.id}
                  className="block rounded border border-slate-200 p-3 transition hover:border-slate-300 hover:bg-slate-50"
                  href={insight.href || '#'}
                >
                  <p className="font-medium text-slate-900">{insight.title}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    {insight.message}
                  </p>
                </a>
              ))}
            </div>
          </section>
        </div>

        <section className="space-y-5" id="recommended-next-moves">
          <div className="rounded border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Advisor cards</p>
            <h2 className="mt-1 text-2xl font-semibold">Recommended next moves</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Prioritized guidance from the Decision Engine, written like a
              financial assistant instead of a debug queue.
            </p>
          </div>

          {groupedDecisions.map((group) => (
            <section key={group.title} className="space-y-3">
              <div>
                <h3 className="text-lg font-semibold">{group.title}</h3>
                <p className="text-sm text-slate-500">{group.description}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {group.decisions.map((decision) => (
                  <AdvisorCard key={decision.id} decision={decision} />
                ))}
              </div>
            </section>
          ))}
        </section>
      </section>

      <section className="mx-auto mt-5 grid max-w-7xl grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Open payments</h2>
          <div className="mt-4 space-y-3">
            {context.liquidity.openPayments.slice(0, 5).map((payment) => (
              <div key={payment.id} className="rounded border border-slate-200 p-3">
                <h3 className="font-medium">
                  {fallback(payment.name, 'Pago sin nombre')}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Amount: ${money(payment.amount)}
                </p>
                <p className="text-sm text-slate-600">
                  Fecha:{' '}
                  {fallback(
                    payment.effective_due_date || payment.due_date,
                    'Sin fecha'
                  )}
                </p>
                <p className="text-sm text-slate-600">
                  Status: {fallback(payment.lifecycleLabel || payment.status)}
                </p>
                {payment.isInGracePeriod && (
                  <p className="text-sm font-medium text-amber-700">
                    Gracia hasta:{' '}
                    {fallback(
                      payment.grace_until || payment.grace_due_date,
                      'fecha configurada'
                    )}
                  </p>
                )}
              </div>
            ))}

            {context.liquidity.openPayments.length === 0 && (
              <p className="text-sm text-slate-500">No open payments right now.</p>
            )}
          </div>
        </div>

        <div className="rounded border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Expected income</h2>
          <div className="mt-4 space-y-3">
            {context.liquidity.projectedIncome.slice(0, 5).map((income) => (
              <div key={income.id || income.name} className="rounded border border-slate-200 p-3">
                <h3 className="font-medium">
                  {fallback(income.name, 'Ingreso sin nombre')}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Amount: ${money(income.amount)}
                </p>
                <p className="text-sm text-slate-600">
                  Fecha: {fallback(income.next_expected_date, 'Sin fecha')}
                </p>
                <p className="text-sm text-slate-600">
                  Status: {fallback(income.status, 'expected')}
                </p>
              </div>
            ))}

            {context.liquidity.projectedIncome.length === 0 && (
              <p className="text-sm text-slate-500">No projected income loaded.</p>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto mt-5 grid max-w-7xl grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-medium text-slate-600">Planning funds</h2>
          <p className="text-3xl font-bold">{context.planning.fundsCount}</p>
          <p className="text-sm text-slate-500">
            ${money(context.planning.totalTargetAmount)} en metas activas
          </p>
        </div>

        <div className="rounded border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-medium text-slate-600">Review queue</h2>
          <p className="text-3xl font-bold">
            {context.reviewQueue.pendingCount}
          </p>
          <p className="text-sm text-slate-500">
            {context.reviewQueue.possibleDuplicateCount} posibles duplicados ·{' '}
            {context.reviewQueue.needsCategoryCount} categorias
          </p>
        </div>

        <div className="rounded border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-medium text-slate-600">Engine state</h2>
          <p className="text-3xl font-bold">
            {context.decision.overallFinancialState}
          </p>
          <p className="text-sm text-slate-500">
            {context.decision.decisionCount} decisiones interpretables
          </p>
        </div>
      </section>

      {context.liquidity.staleAccountWarnings.length > 0 && (
        <section className="mx-auto mt-5 max-w-7xl rounded border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Balances to review</h2>
          <div className="mt-4 space-y-3">
            {context.liquidity.staleAccountWarnings.map((warning) => (
              <div key={warning.id} className="rounded border border-slate-200 p-3">
                <p className="font-medium">{warning.label}</p>
                <p className="text-sm text-slate-600">
                  Ultimo update:{' '}
                  {fallback(warning.lastUpdatedAt, 'Sin fecha de sync')}
                </p>
                {warning.ageHours !== null && (
                  <p className="text-sm text-slate-500">
                    Hace aproximadamente {warning.ageHours} horas.
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  )
}

function KpiCard({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper: string
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-normal text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-sm text-slate-500">{helper}</p>
    </div>
  )
}

function SummaryItem({ label }: { label: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
      <span>{label}</span>
    </li>
  )
}

function AdvisorCard({ decision }: { decision: MansorDecision }) {
  const style = decisionStyle(decision)

  return (
    <article
      className={`rounded border border-l-4 border-slate-200 ${style.accent} bg-white p-5 shadow-sm`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${style.iconClass}`}
        >
          {style.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-normal text-slate-500">
              {decisionLabel(decision.type)}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${style.badgeClass}`}
            >
              Confidence {confidenceLabel(decision.confidence)}
            </span>
          </div>
          <h4 className="mt-2 text-lg font-semibold leading-6 text-slate-950">
            {advisorTitle(decision)}
          </h4>
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-normal text-slate-500">
              Recommended action
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-800">
              {decision.recommendation}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {decision.evidence.slice(0, 2).map((fact) => (
              <span
                key={fact}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"
              >
                {fact}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              className="inline-flex rounded bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              href={decision.actionHref}
            >
              {decision.actionLabel}
            </a>
            <details className="group">
              <summary className="cursor-pointer list-none text-sm font-medium text-slate-600 underline underline-offset-4">
                Why?
              </summary>
              <div className="mt-3 rounded border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-600">
                <p>{decision.explanation}</p>
                {decision.evidence.length > 2 && (
                  <ul className="mt-2 space-y-1">
                    {decision.evidence.slice(2).map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          </div>
        </div>
      </div>
    </article>
  )
}
