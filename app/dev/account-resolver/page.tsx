import { requireUser } from '@/lib/auth/requireUser'
import { getResolvedAccounts } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export default async function DevAccountResolverPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const result = await getResolvedAccounts(supabase, user.id)

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dev Account Resolver</h1>
        <p className="text-sm opacity-70">
          Temporary developer tooling for Plaid account duplicate resolution.
        </p>
      </div>

      <section className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">resolvedAccounts</h2>
          <span className="text-sm">{result.resolvedAccounts.length} rows</span>
        </div>

        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(result.resolvedAccounts)}
        </pre>
      </section>

      <section className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">duplicateGroups</h2>
          <span className="text-sm">{result.duplicateGroups.length} rows</span>
        </div>

        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(result.duplicateGroups)}
        </pre>
      </section>

      <section className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">warnings</h2>
          <span className="text-sm">{result.warnings.length} rows</span>
        </div>

        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(result.warnings)}
        </pre>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Raw JSON</h2>
        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(result)}
        </pre>
      </section>
    </main>
  )
}
