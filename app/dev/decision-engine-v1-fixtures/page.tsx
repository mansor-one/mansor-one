import { decisionEngineV1FixtureResults } from '@/lib/financial-engine/decision-engine-v1.fixtures'

export const dynamic = 'force-static'

export default function DecisionEngineV1FixturesPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Dev validation fixtures
          </p>
          <h1 className="mt-1 text-3xl font-semibold">
            Decision Engine v1
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Static fixture scenarios for reviewing rule priority, ordering, and
            normalized decision output without database access.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-4">
          {decisionEngineV1FixtureResults.map((scenario) => (
            <article
              key={scenario.id}
              className="rounded border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {scenario.id}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    {scenario.title}
                  </h2>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-600">
                  {scenario.decisions.length} decision
                  {scenario.decisions.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="mt-4 overflow-hidden rounded border border-slate-200">
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
                    {scenario.decisions.map((decision) => (
                      <tr
                        key={`${scenario.id}-${decision.type}-${decision.title}`}
                        className="border-t border-slate-200 align-top"
                      >
                        <td className="p-3 font-medium">{decision.type}</td>
                        <td className="p-3">{decision.priority}</td>
                        <td className="p-3">{decision.severity}</td>
                        <td className="p-3">{decision.title}</td>
                        <td className="p-3">
                          <ul className="space-y-1">
                            {decision.evidence.map((fact) => (
                              <li key={fact}>{fact}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="p-3">{decision.actionHref}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  )
}
