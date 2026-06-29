import { requireUser } from '@/lib/auth/requireUser'
import {
  buildFinancialIdentities,
  type FinancialIdentityObservation,
} from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type PlaidImportRow = {
  id: string
  merchant: string | null
  amount: number | string | null
  plaid_category: string | null
  transaction_date: string | null
}

type QuickEntryRow = {
  id: string
  description: string | null
  amount: number | string | null
  entry_date: string | null
}

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function money(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

function plaidObservation(
  row: PlaidImportRow
): FinancialIdentityObservation | null {
  const name = row.merchant || row.plaid_category

  if (!name || !row.transaction_date) return null

  return {
    id: row.id,
    source: 'plaid_imports',
    name,
    amount: Number(row.amount || 0),
    date: row.transaction_date,
  }
}

function quickEntryObservation(
  row: QuickEntryRow
): FinancialIdentityObservation | null {
  if (!row.description || !row.entry_date) return null

  return {
    id: row.id,
    source: 'quick_entries',
    name: row.description,
    amount: Number(row.amount || 0),
    date: row.entry_date,
  }
}

export default async function DevFinancialIdentityPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)

  const [plaidResult, quickEntriesResult] = await Promise.all([
    supabase
      .from('plaid_imports')
      .select('id, merchant, amount, plaid_category, transaction_date')
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false })
      .limit(300),
    supabase
      .from('quick_entries')
      .select('id, description, amount, entry_date')
      .eq('user_id', user.id)
      .order('entry_date', { ascending: false })
      .limit(300),
  ])

  const plaidObservations =
    ((plaidResult.data || []) as PlaidImportRow[])
      .map(plaidObservation)
      .filter(
        (observation): observation is FinancialIdentityObservation =>
          Boolean(observation)
      ) || []
  const quickEntryObservations =
    ((quickEntriesResult.data || []) as QuickEntryRow[])
      .map(quickEntryObservation)
      .filter(
        (observation): observation is FinancialIdentityObservation =>
          Boolean(observation)
      ) || []
  const observations = [...plaidObservations, ...quickEntryObservations].sort(
    (a, b) => String(b.date).localeCompare(String(a.date))
  )
  const identities = buildFinancialIdentities(observations)

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dev Financial Identity</h1>
        <p className="text-sm opacity-70">
          Read-only live view for Financial Identity Engine v1.
        </p>
      </div>

      {(plaidResult.error || quickEntriesResult.error) && (
        <section className="border rounded p-4 text-red-600">
          <h2 className="text-xl font-bold">Source errors</h2>
          <pre className="mt-3 overflow-auto text-sm">
            {asJson({
              plaid_imports: plaidResult.error,
              quick_entries: quickEntriesResult.error,
            })}
          </pre>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Source rows</h2>
          <p className="mt-3 text-3xl font-bold">{observations.length}</p>
        </div>
        <div className="border rounded p-4">
          <h2 className="font-semibold">Plaid imports</h2>
          <p className="mt-3 text-3xl font-bold">
            {plaidObservations.length}
          </p>
        </div>
        <div className="border rounded p-4">
          <h2 className="font-semibold">Quick entries</h2>
          <p className="mt-3 text-3xl font-bold">
            {quickEntryObservations.length}
          </p>
        </div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Identities</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {identities.map((identity) => (
            <div
              className="border rounded p-3 space-y-2"
              key={identity.normalizedIdentity}
            >
              <div>
                <h3 className="font-semibold">
                  {identity.normalizedIdentity}
                </h3>
                <p className="text-sm opacity-70">
                  {identity.sourceNames.join(', ')}
                </p>
              </div>

              <p>Type: {identity.identityType}</p>
              <p>Confidence: {percent(identity.confidence)}</p>
              <p>Should review: {identity.shouldReview ? 'Yes' : 'No'}</p>
              <p>
                Sources: plaid_imports {identity.sourceCounts.plaid_imports},
                quick_entries {identity.sourceCounts.quick_entries}
              </p>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <p>
                  Examples:{' '}
                  {identity.exampleAmounts
                    .map((amount) => `$${money(amount)}`)
                    .join(', ')}
                </p>
                <p>Last seen: {identity.lastSeen || 'N/A'}</p>
              </div>
            </div>
          ))}

          {identities.length === 0 && (
            <p className="opacity-70">No financial identities found.</p>
          )}
        </div>
      </section>

      <details className="border rounded p-4">
        <summary className="font-semibold">Raw JSON</summary>
        <pre className="mt-3 overflow-auto text-sm">
          {asJson({
            observations,
            identities,
          })}
        </pre>
      </details>
    </main>
  )
}
