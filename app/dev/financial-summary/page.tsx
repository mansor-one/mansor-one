import { requireUser } from '@/lib/auth/requireUser'
import { getFinancialSummary } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function numberValue(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default async function DevFinancialSummaryPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const summary = await getFinancialSummary(supabase, user.id)

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dev Financial Summary</h1>
        <p className="text-sm opacity-70">
          Read-only validation page for Financial Summary v1.
        </p>
      </div>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Briefing</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded p-3">
            <h3 className="font-semibold">Usable available today</h3>
            <p className="text-2xl font-bold">
              {numberValue(summary.briefing.availableToday)}
            </p>
            <p className="text-xs opacity-70">
              From Portfolio totalLiquidAvailable
            </p>
          </div>
          <div className="border rounded p-3">
            <h3 className="font-semibold">Net worth</h3>
            <p className="text-2xl font-bold">
              {numberValue(summary.briefing.netWorth)}
            </p>
          </div>
          <div className="border rounded p-3">
            <h3 className="font-semibold">Credit debt</h3>
            <p className="text-2xl font-bold">
              {numberValue(summary.briefing.totalCreditDebt)}
            </p>
          </div>
          <div className="border rounded p-3">
            <h3 className="font-semibold">Pending action payments</h3>
            <p className="text-2xl font-bold">
              {numberValue(summary.briefing.pendingActionPaymentTotal)}
            </p>
          </div>
          <div className="border rounded p-3">
            <h3 className="font-semibold">Initiated payments</h3>
            <p className="text-2xl font-bold">
              {numberValue(summary.briefing.initiatedPaymentsTotal)}
            </p>
          </div>
          <div className="border rounded p-3">
            <h3 className="font-semibold">Committed total</h3>
            <p className="text-2xl font-bold">
              {numberValue(summary.briefing.committedPaymentsTotal)}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {summary.briefing.lines.map((line) => (
            <p key={line} className="border rounded p-3">
              {line}
            </p>
          ))}
        </div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Alerts</h2>
        <div className="space-y-2">
          {summary.alerts.map((alert) => (
            <div key={alert.id} className="border rounded p-3">
              <h3 className="font-semibold">
                {alert.title} ({alert.severity})
              </h3>
              <p>{alert.message}</p>
              <p className="text-sm opacity-70">
                {alert.metric}: {numberValue(alert.value)}
              </p>
            </div>
          ))}
          {summary.alerts.length === 0 && (
            <p className="opacity-70">No alerts.</p>
          )}
        </div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Recommendations</h2>
        <div className="space-y-2">
          {summary.recommendations.map((recommendation) => (
            <div key={recommendation.id} className="border rounded p-3">
              <h3 className="font-semibold">
                {recommendation.title} ({recommendation.actionType})
              </h3>
              <p>{recommendation.message}</p>
              <p className="text-sm opacity-70">
                Priority {recommendation.priority}: {recommendation.reason}
              </p>
            </div>
          ))}
          {summary.recommendations.length === 0 && (
            <p className="opacity-70">No recommendations.</p>
          )}
        </div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Payment Lifecycle</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded p-3">
            <h3 className="font-semibold">Pending requiring action</h3>
            <p className="text-2xl font-bold">
              {numberValue(
                summary.dashboard.liquidity.pendingActionPaymentTotal
              )}
            </p>
            <pre className="mt-3 text-xs overflow-auto">
              {asJson(summary.dashboard.liquidity.pendingActionPayments)}
            </pre>
          </div>
          <div className="border rounded p-3">
            <h3 className="font-semibold">Initiated waiting confirmation</h3>
            <p className="text-2xl font-bold">
              {numberValue(summary.dashboard.liquidity.initiatedPaymentsTotal)}
            </p>
            <pre className="mt-3 text-xs overflow-auto">
              {asJson(summary.dashboard.liquidity.initiatedPayments)}
            </pre>
          </div>
          <div className="border rounded p-3">
            <h3 className="font-semibold">Committed total</h3>
            <p className="text-2xl font-bold">
              {numberValue(summary.dashboard.liquidity.committedPaymentsTotal)}
            </p>
            <pre className="mt-3 text-xs overflow-auto">
              {asJson(summary.dashboard.liquidity.committedPayments)}
            </pre>
          </div>
        </div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Dashboard object</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded p-3">
            <h3 className="font-semibold">Usable liquid total</h3>
            <p className="text-2xl font-bold">
              {numberValue(summary.source.portfolio.totalLiquidAvailable)}
            </p>
          </div>
          <div className="border rounded p-3">
            <h3 className="font-semibold">Connected usable liquid</h3>
            <p className="text-2xl font-bold">
              {numberValue(
                summary.source.portfolio.totalConnectedLiquidAvailable
              )}
            </p>
          </div>
          <div className="border rounded p-3">
            <h3 className="font-semibold">Manual usable liquid</h3>
            <p className="text-2xl font-bold">
              {numberValue(summary.source.portfolio.totalManualLiquidAvailable)}
            </p>
          </div>
        </div>
        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(summary.dashboard)}
        </pre>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Health object</h2>
        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(summary.health)}
        </pre>
      </section>

      <details className="border rounded p-4">
        <summary className="font-semibold">Raw source summaries</summary>
        <pre className="mt-3 border rounded p-3 text-sm overflow-auto">
          {asJson(summary.source)}
        </pre>
      </details>
    </main>
  )
}
