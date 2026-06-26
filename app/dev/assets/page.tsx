import { requireUser } from '@/lib/auth/requireUser'
import {
  getAssets,
  getConnectedAssets,
  getCreditAssets,
  getLiquidAssets,
  getManualAssets,
} from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export default async function DevAssetsPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)

  const [allAssets, liquidAssets, creditAssets, connectedAssets, manualAssets] =
    await Promise.all([
      getAssets(supabase, user.id),
      getLiquidAssets(supabase, user.id),
      getCreditAssets(supabase, user.id),
      getConnectedAssets(supabase, user.id),
      getManualAssets(supabase, user.id),
    ])

  const rawJson = {
    allAssets,
    liquidAssets,
    creditAssets,
    connectedAssets,
    manualAssets,
  }

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dev Assets</h1>
        <p className="text-sm opacity-70">
          Temporary developer tooling for Financial Engine assets.
        </p>
      </div>

      <section className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">all assets</h2>
          <span className="text-sm">{allAssets.length} rows</span>
        </div>
        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(allAssets)}
        </pre>
      </section>

      <section className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">liquid assets</h2>
          <span className="text-sm">{liquidAssets.length} rows</span>
        </div>
        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(liquidAssets)}
        </pre>
      </section>

      <section className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">credit assets</h2>
          <span className="text-sm">{creditAssets.length} rows</span>
        </div>
        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(creditAssets)}
        </pre>
      </section>

      <section className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">connected assets</h2>
          <span className="text-sm">{connectedAssets.length} rows</span>
        </div>
        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(connectedAssets)}
        </pre>
      </section>

      <section className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">manual assets</h2>
          <span className="text-sm">{manualAssets.length} rows</span>
        </div>
        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(manualAssets)}
        </pre>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Raw JSON</h2>
        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(rawJson)}
        </pre>
      </section>
    </main>
  )
}
