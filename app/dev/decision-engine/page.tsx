import { requireUser } from '@/lib/auth/requireUser'
import { getFinancialEngineSnapshot } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default async function DevDecisionEnginePage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const snapshot = await getFinancialEngineSnapshot(supabase, user.id)
  const decisions = snapshot.decisionEngineV1

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dev Decision Engine v1</h1>
        <p className="text-sm opacity-70">
          Read-only inspector for normalized Decision Engine v1 decisions.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Decisions</h2>
          <p className="text-3xl font-bold">{decisions.length}</p>
        </div>
        <div className="border rounded p-4">
          <h2 className="font-semibold">Available Cash</h2>
          <p className="text-3xl font-bold">
            ${money(snapshot.liquidity.cashAvailableTotal)}
          </p>
        </div>
        <div className="border rounded p-4">
          <h2 className="font-semibold">Lowest Point</h2>
          <p className="text-3xl font-bold">
            ${money(snapshot.timeline.explanation.lowestPoint.balance)}
          </p>
        </div>
        <div className="border rounded p-4">
          <h2 className="font-semibold">Review Queue</h2>
          <p className="text-3xl font-bold">
            {snapshot.reviewQueue.statistics.totalCandidates}
          </p>
        </div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Normalized Decisions</h2>

        <div className="space-y-3">
          {decisions.map((decision) => (
            <div key={decision.id} className="border rounded p-3 space-y-2">
              <div>
                <h3 className="font-semibold">
                  {decision.priority}. {decision.title}
                </h3>
                <p className="text-sm opacity-70">
                  {decision.type} · {decision.severity} · confidence{' '}
                  {decision.confidence}
                </p>
              </div>

              <p>{decision.recommendation}</p>
              <p className="text-sm opacity-70">{decision.explanation}</p>
              <p className="text-sm opacity-70">
                Action: {decision.actionLabel} · {decision.actionHref}
              </p>
            </div>
          ))}

          {decisions.length === 0 && (
            <p className="opacity-70">No Decision Engine v1 decisions generated.</p>
          )}
        </div>
      </section>

      <details className="border rounded p-4">
        <summary className="font-semibold">Raw Decision Engine v1 Output</summary>
        <pre className="mt-3 border rounded p-3 text-sm overflow-auto">
          {asJson(decisions)}
        </pre>
      </details>
    </main>
  )
}
