import { debtStrategyFixtureResults } from '@/lib/financial-engine/debt-strategy.fixtures'

export const dynamic = 'force-static'

function money(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function percent(value: number) {
  return `${Math.round(Number(value || 0))}%`
}

export default function DevDebtStrategyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Dev validation fixtures
          </p>
          <h1 className="mt-1 text-3xl font-semibold">
            Debt Strategy Engine v1
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Static scenarios for reviewing debt strategy insights without live
            data, database calls, or payoff simulations.
          </p>
        </section>

        {debtStrategyFixtureResults.map((scenario) => (
          <section
            key={scenario.id}
            className="rounded border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {scenario.id}
                </p>
                <h2 className="mt-1 text-xl font-semibold">
                  {scenario.title}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Cash risk:{' '}
                  {scenario.cashRisk.isHigh ? 'high' : 'not high'} -{' '}
                  {scenario.cashRisk.reason}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <Metric
                  label="Debt"
                  value={`$${money(scenario.totals.totalCreditDebt)}`}
                />
                <Metric
                  label="Available"
                  value={`$${money(scenario.totals.totalCreditAvailable)}`}
                />
                <Metric
                  label="Utilization"
                  value={percent(scenario.totals.creditUtilizationPercent)}
                />
                <Metric
                  label="Minimums"
                  value={`$${money(scenario.totals.totalMinimumPayments)}`}
                />
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded border border-slate-200">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-3 font-medium">Type</th>
                    <th className="p-3 font-medium">Priority</th>
                    <th className="p-3 font-medium">Severity</th>
                    <th className="p-3 font-medium">Title</th>
                    <th className="p-3 font-medium">Evidence</th>
                    <th className="p-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {scenario.insights.map((insight) => (
                    <tr
                      key={`${scenario.id}-${insight.type}-${insight.title}`}
                      className="border-t border-slate-200 align-top"
                    >
                      <td className="p-3 font-medium">{insight.type}</td>
                      <td className="p-3">{insight.priority}</td>
                      <td className="p-3">{insight.severity}</td>
                      <td className="p-3">{insight.title}</td>
                      <td className="p-3">
                        <ul className="space-y-1">
                          {insight.evidence.map((fact) => (
                            <li key={fact}>{fact}</li>
                          ))}
                        </ul>
                      </td>
                      <td className="p-3">{insight.actionHref}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-700">Limitations</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {scenario.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  )
}
