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

function percentValue(value: number) {
  return `${numberValue(value)}%`
}

export default async function DevPortfolioPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const summary = await getPortfolioSummary(supabase, user.id)

  const totals = [
    { label: 'totalAssetBalance', value: summary.totalAssetBalance },
    { label: 'totalLiabilities', value: summary.totalLiabilities },
    { label: 'netWorth', value: summary.netWorth },
    { label: 'manualCreditDebt', value: summary.manualCreditDebt },
    { label: 'connectedCreditDebt', value: summary.connectedCreditDebt },
    {
      label: 'totalLiquidAvailable (usable)',
      value: summary.totalLiquidAvailable,
    },
    {
      label: 'totalConnectedLiquidAvailable (usable)',
      value: summary.totalConnectedLiquidAvailable,
    },
    {
      label: 'totalManualLiquidAvailable (usable)',
      value: summary.totalManualLiquidAvailable,
    },
    { label: 'totalCreditDebt', value: summary.totalCreditDebt },
    { label: 'totalCreditAvailable', value: summary.totalCreditAvailable },
    {
      label: 'totalManualLiabilities',
      value: summary.totalManualLiabilities,
    },
    {
      label: 'totalConnectedLiabilities',
      value: summary.totalConnectedLiabilities,
    },
    { label: 'totalConnectedAssets', value: summary.totalConnectedAssets },
    { label: 'totalManualAssets', value: summary.totalManualAssets },
    { label: 'totalAssets', value: summary.totalAssets },
    { label: 'totalCreditAssets', value: summary.totalCreditAssets },
    { label: 'totalLiquidAssets', value: summary.totalLiquidAssets },
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
        <h2 className="text-xl font-bold">Liabilities</h2>

        <div className="space-y-3">
          {summary.liabilities.map((liability) => (
            <div key={liability.id} className="border rounded p-3">
              <h3 className="font-semibold">
                {liability.name || 'Unnamed liability'}
              </h3>
              <p>Source: {liability.source}</p>
              <p>Institution: {liability.institution || 'N/A'}</p>
              <p>Type: {liability.liabilityType}</p>
              <p>Balance: {numberValue(liability.balance)}</p>
              <p>
                Minimum payment:{' '}
                {liability.minimumPayment === null
                  ? 'N/A'
                  : numberValue(liability.minimumPayment)}
              </p>
              <p>Due day: {liability.dueDay || 'N/A'}</p>
              <p>APR: {liability.apr ?? 'N/A'}</p>
            </div>
          ))}

          {summary.liabilities.length === 0 && (
            <p className="opacity-70">No liabilities found.</p>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="border rounded p-4 space-y-3">
          <h2 className="text-xl font-bold">cashByInstitution</h2>
          <p className="text-sm opacity-70">
            Liquid cash now keeps raw balance and available values, and uses
            totalUsable for spendable cash.
          </p>
          <div className="space-y-2">
            {summary.cashByInstitution.map((item) => (
              <div key={item.institution} className="border rounded p-3">
                <h3 className="font-semibold">{item.institution}</h3>
                <p>Balance: {numberValue(item.totalBalance)}</p>
                <p>Available: {numberValue(item.totalAvailable)}</p>
                <p>Usable: {numberValue(item.totalUsable)}</p>
                <p>Count: {item.count}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border rounded p-4 space-y-3">
          <h2 className="text-xl font-bold">creditDebtByInstitution</h2>
          <div className="space-y-2">
            {summary.creditDebtByInstitution.map((item) => (
              <div key={item.institution} className="border rounded p-3">
                <h3 className="font-semibold">{item.institution}</h3>
                <p>Balance: {numberValue(item.totalBalance)}</p>
                <p>Count: {item.count}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border rounded p-4 space-y-3">
          <h2 className="text-xl font-bold">
            creditAvailableByInstitution
          </h2>
          <div className="space-y-2">
            {summary.creditAvailableByInstitution.map((item) => (
              <div key={item.institution} className="border rounded p-3">
                <h3 className="font-semibold">{item.institution}</h3>
                <p>Available: {numberValue(item.totalAvailable)}</p>
                <p>Balance: {numberValue(item.totalBalance)}</p>
                <p>Count: {item.count}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-4 space-y-3">
          <h2 className="text-xl font-bold">assetAllocation</h2>
          <div className="space-y-2">
            {summary.assetAllocation.map((item) => (
              <div key={item.label} className="border rounded p-3">
                <h3 className="font-semibold">{item.label}</h3>
                <p>Value: {numberValue(item.value)}</p>
                <p>Percent: {percentValue(item.percent)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border rounded p-4 space-y-3">
          <h2 className="text-xl font-bold">debtAllocation</h2>
          <div className="space-y-2">
            {summary.debtAllocation.map((item) => (
              <div key={item.label} className="border rounded p-3">
                <h3 className="font-semibold">{item.label}</h3>
                <p>Value: {numberValue(item.value)}</p>
                <p>Percent: {percentValue(item.percent)}</p>
              </div>
            ))}
          </div>
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
