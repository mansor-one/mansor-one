import { requireUser } from '@/lib/auth/requireUser'
import { getDecisionEngineResult } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function percentValue(value: number) {
  return `${Math.round(value * 100)}%`
}

function numberValue(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default async function DevDecisionEnginePage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const result = await getDecisionEngineResult(supabase, user.id)

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dev Decision Engine</h1>
        <p className="text-sm opacity-70">
          Read-only validation page for Decision Engine v1.
        </p>
      </div>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Overall Financial State</h2>
        <p className="text-3xl font-bold">{result.overallFinancialState}</p>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Payment Lifecycle</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded p-3">
            <h3 className="font-semibold">Pending requiring action</h3>
            <p className="text-2xl font-bold">
              {numberValue(
                result.source.dashboard.liquidity.pendingActionPaymentTotal
              )}
            </p>
            <pre className="mt-3 text-xs overflow-auto">
              {asJson(result.source.dashboard.liquidity.pendingActionPayments)}
            </pre>
          </div>
          <div className="border rounded p-3">
            <h3 className="font-semibold">Initiated waiting confirmation</h3>
            <p className="text-2xl font-bold">
              {numberValue(
                result.source.dashboard.liquidity.initiatedPaymentsTotal
              )}
            </p>
            <pre className="mt-3 text-xs overflow-auto">
              {asJson(result.source.dashboard.liquidity.initiatedPayments)}
            </pre>
          </div>
          <div className="border rounded p-3">
            <h3 className="font-semibold">Committed total</h3>
            <p className="text-2xl font-bold">
              {numberValue(
                result.source.dashboard.liquidity.committedPaymentsTotal
              )}
            </p>
            <pre className="mt-3 text-xs overflow-auto">
              {asJson(result.source.dashboard.liquidity.committedPayments)}
            </pre>
          </div>
        </div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Decision Queue</h2>

        <div className="space-y-3">
          {result.decisions.map((decision) => (
            <div key={decision.id} className="border rounded p-3 space-y-2">
              <div>
                <h3 className="font-semibold">
                  {decision.priority}. {decision.title}
                </h3>
                <p className="text-sm opacity-70">
                  {decision.type} · {decision.severity} · impact{' '}
                  {decision.impactScore} · confidence{' '}
                  {percentValue(decision.confidence)}
                </p>
              </div>

              <p>{decision.explanation}</p>
              <p>{decision.recommendation}</p>
              <p className="text-sm opacity-70">
                Action: {decision.actionUrl} · Generated:{' '}
                {decision.generatedAt}
              </p>
            </div>
          ))}

          {result.decisions.length === 0 && (
            <p className="opacity-70">No financial decisions generated.</p>
          )}
        </div>
      </section>

      <details className="border rounded p-4">
        <summary className="font-semibold">Raw Financial Summary</summary>
        <pre className="mt-3 border rounded p-3 text-sm overflow-auto">
          {asJson(result.source)}
        </pre>
      </details>
    </main>
  )
}
