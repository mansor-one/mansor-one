import { requireUser } from '@/lib/auth/requireUser'
import { getDashboardSummary } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function money(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default async function DevFinancialEnginePage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const summary = await getDashboardSummary(supabase, user.id)

  const totals = [
    {
      label: 'cashAvailableTotal',
      value: summary.liquidity.cashAvailableTotal,
    },
    {
      label: 'totalPendingPayments',
      value: summary.liquidity.totalPendingPayments,
    },
    {
      label: 'totalConfirmedIncome',
      value: summary.liquidity.totalConfirmedIncome,
    },
    {
      label: 'resultToday',
      value: summary.liquidity.resultToday,
    },
    {
      label: 'resultAfterIncome',
      value: summary.liquidity.resultAfterIncome,
    },
    {
      label: 'connectedCreditDebt',
      value: summary.liquidity.connectedCreditDebt,
    },
    {
      label: 'connectedCreditAvailable',
      value: summary.liquidity.connectedCreditAvailable,
    },
    {
      label: 'manualCardDebt',
      value: summary.liquidity.manualCardDebt,
    },
    {
      label: 'manualMinimumPayments',
      value: summary.liquidity.manualMinimumPayments,
    },
    {
      label: 'totalFutureObligations',
      value: summary.planning.totalFutureObligations,
    },
  ]

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dev Financial Engine</h1>
        <p className="text-sm opacity-70">
          Temporary validation page for comparing Financial Engine output
          against the current dashboard.
        </p>
      </div>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Key totals</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {totals.map((total) => (
            <div className="border rounded p-3" key={total.label}>
              <h3 className="font-semibold">{total.label}</h3>
              <p className="text-2xl font-bold">${money(total.value)}</p>
              <p className="text-xs opacity-70">{total.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Raw JSON result</h2>
        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(summary)}
        </pre>
      </section>
    </main>
  )
}
