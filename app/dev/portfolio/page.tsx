import { requireUser } from '@/lib/auth/requireUser'
import { getPortfolioSummary } from '@/lib/financial-engine'
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

export default async function DevPortfolioPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const summary = await getPortfolioSummary(supabase, user.id)

  const totals = [
    { label: 'totalAssetBalance', value: summary.totalAssetBalance },
    { label: 'totalLiquidAvailable', value: summary.totalLiquidAvailable },
    {
      label: 'totalConnectedLiquidAvailable',
      value: summary.totalConnectedLiquidAvailable,
    },
    {
      label: 'totalManualLiquidAvailable',
      value: summary.totalManualLiquidAvailable,
    },
    { label: 'totalCreditDebt', value: summary.totalCreditDebt },
    { label: 'totalCreditAvailable', value: summary.totalCreditAvailable },
    { label: 'totalConnectedAssets', value: summary.totalConnectedAssets },
    { label: 'totalManualAssets', value: summary.totalManualAssets },
    { label: 'totalAssets', value: summary.totalAssets },
    { label: 'totalCreditAssets', value: summary.totalCreditAssets },
    { label: 'totalLiquidAssets', value: summary.totalLiquidAssets },
    { label: 'netWorth', value: summary.netWorth },
    {
      label: 'creditUtilizationPercent',
      value: summary.creditUtilizationPercent,
    },
  ]

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dev Portfolio</h1>
        <p className="text-sm opacity-70">
          Temporary developer tooling for Portfolio Summary v1.
        </p>
      </div>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Key totals</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {totals.map((total) => (
            <div className="border rounded p-3" key={total.label}>
              <h3 className="font-semibold">{total.label}</h3>
              <p className="text-2xl font-bold">{numberValue(total.value)}</p>
              <p className="text-xs opacity-70">{total.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Raw JSON</h2>
        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(summary)}
        </pre>
      </section>
    </main>
  )
}
