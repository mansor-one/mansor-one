import { requireUser } from '@/lib/auth/requireUser'
import {
  buildMerchantKnowledge,
  getMerchantLearningState,
  type MerchantObservation,
  normalizeMerchantName,
} from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type SourceName = 'plaid_imports' | 'quick_entries'

type PlaidImportRow = {
  id: string
  merchant: string | null
  amount: number | string | null
  suggested_category: string | null
  plaid_category: string | null
  transaction_date: string | null
  created_at: string | null
}

type QuickEntryRow = {
  id: string
  description: string | null
  amount: number | string | null
  category: string | null
  entry_date: string | null
  created_at: string | null
}

type LiveMerchantObservation = MerchantObservation & {
  id: string
  source: SourceName
  legacyCategoryText: string | null
  rawMerchantName: string | null
}

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
  return `${Math.round(value * 100)}%`
}

function normalizeLegacyCategory(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function mapLegacyCategoryToCanonicalCode(legacyCategoryText: string | null) {
  const category = normalizeLegacyCategory(legacyCategoryText)

  if (!category || category === 'revisar') return null
  if (category === 'comida fuera' || category === 'fast food') {
    return 'food_dining'
  }
  if (category === 'cafeteria') {
    return 'food_cafeteria'
  }
  if (category === 'gasolina') return 'transportation_gas'
  if (category === 'farmacia') return 'health_pharmacy'
  if (category === 'pago de tarjeta') return 'finance_credit_card_payment'
  if (category === 'transferencia') return 'transfers_transfer'
  if (category === 'ingreso') return 'income_income'

  return null
}

function plaidObservation(row: PlaidImportRow): LiveMerchantObservation | null {
  const merchantName = row.merchant || row.plaid_category
  const legacyCategoryText = row.suggested_category
  const date = row.transaction_date

  if (!merchantName || !date) return null

  return {
    id: row.id,
    source: 'plaid_imports',
    rawMerchantName: merchantName,
    merchantName,
    amount: Number(row.amount || 0),
    date,
    legacyCategoryText,
    canonicalCategoryCode: mapLegacyCategoryToCanonicalCode(legacyCategoryText),
  }
}

function quickEntryObservation(
  row: QuickEntryRow
): LiveMerchantObservation | null {
  const merchantName = row.description
  const legacyCategoryText = row.category
  const date = row.entry_date

  if (!merchantName || !date) return null

  return {
    id: row.id,
    source: 'quick_entries',
    rawMerchantName: merchantName,
    merchantName,
    amount: Number(row.amount || 0),
    date,
    legacyCategoryText,
    canonicalCategoryCode: mapLegacyCategoryToCanonicalCode(legacyCategoryText),
  }
}

function groupObservations(observations: LiveMerchantObservation[]) {
  const groups = new Map<string, LiveMerchantObservation[]>()

  observations.forEach((observation) => {
    const normalizedName = normalizeMerchantName(observation.merchantName)
    if (!normalizedName) return

    const group = groups.get(normalizedName) || []
    group.push(observation)
    groups.set(normalizedName, group)
  })

  return [...groups.values()]
}

function legacyCategorySummary(observations: LiveMerchantObservation[]) {
  const categories = new Map<string, number>()

  observations.forEach((observation) => {
    const label = observation.legacyCategoryText || 'None'
    categories.set(label, (categories.get(label) || 0) + 1)
  })

  return [...categories.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function sourceCounts(observations: LiveMerchantObservation[]) {
  return observations.reduce(
    (counts, observation) => ({
      ...counts,
      [observation.source]: counts[observation.source] + 1,
    }),
    {
      plaid_imports: 0,
      quick_entries: 0,
    } as Record<SourceName, number>
  )
}

export default async function DevMerchantKnowledgePage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)

  const [plaidResult, quickEntriesResult] = await Promise.all([
    supabase
      .from('plaid_imports')
      .select(
        'id, merchant, amount, suggested_category, plaid_category, transaction_date, created_at'
      )
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false })
      .limit(300),
    supabase
      .from('quick_entries')
      .select('id, description, amount, category, entry_date, created_at')
      .eq('user_id', user.id)
      .order('entry_date', { ascending: false })
      .limit(300),
  ])

  const plaidObservations =
    ((plaidResult.data || []) as PlaidImportRow[])
      .map(plaidObservation)
      .filter((observation): observation is LiveMerchantObservation =>
        Boolean(observation)
      ) || []
  const quickEntryObservations =
    ((quickEntriesResult.data || []) as QuickEntryRow[])
      .map(quickEntryObservation)
      .filter((observation): observation is LiveMerchantObservation =>
        Boolean(observation)
      ) || []
  const observations = [...plaidObservations, ...quickEntryObservations].sort(
    (a, b) => b.date.localeCompare(a.date)
  )

  const knowledge = groupObservations(observations)
    .map((group) => {
      const merchantKnowledge = buildMerchantKnowledge(group)

      return {
        ...merchantKnowledge,
        learningState: getMerchantLearningState(merchantKnowledge),
        sourceCounts: sourceCounts(group),
        legacyCategories: legacyCategorySummary(group),
        sourceMerchants: [...new Set(group.map((item) => item.rawMerchantName))],
      }
    })
    .sort((a, b) => b.timesSeen - a.timesSeen || b.confidence - a.confidence)

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dev Merchant Knowledge</h1>
        <p className="text-sm opacity-70">
          Read-only live view for Merchant Knowledge Engine v1.1.
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
        <h2 className="text-xl font-bold">Normalized Merchants</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {knowledge.map((merchant) => (
            <div
              className="border rounded p-3 space-y-2"
              key={merchant.normalizedMerchantName}
            >
              <div>
                <h3 className="font-semibold">
                  {merchant.normalizedMerchantName}
                </h3>
                <p className="text-sm opacity-70">
                  {merchant.sourceMerchants.join(', ')}
                </p>
              </div>

              <p>Category: {merchant.canonicalCategoryCode || 'None'}</p>
              <p>
                Legacy category:{' '}
                {merchant.legacyCategories
                  .map((category) => `${category.label} (${category.count})`)
                  .join(', ')}
              </p>
              <p>Confidence: {percentValue(merchant.confidence)}</p>
              <p>State: {merchant.learningState.state}</p>
              <p>Stable: {merchant.isStable ? 'Yes' : 'No'}</p>
              <p>Should ask again: {merchant.shouldAskAgain ? 'Yes' : 'No'}</p>
              <p>
                Sources: plaid_imports {merchant.sourceCounts.plaid_imports},
                quick_entries {merchant.sourceCounts.quick_entries}
              </p>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <p>Times seen: {merchant.timesSeen}</p>
                <p>Average: {numberValue(merchant.averageAmount)}</p>
                <p>Minimum: {numberValue(merchant.minimumAmount)}</p>
                <p>Maximum: {numberValue(merchant.maximumAmount)}</p>
                <p className="col-span-2">Last seen: {merchant.lastSeen}</p>
              </div>

              <div className="text-sm">
                <p className="font-medium">Confidence reasons</p>
                <ul className="list-disc pl-5">
                  {merchant.confidenceReasons.map((reason) => (
                    <li key={reason.code}>
                      {reason.code}: {reason.description}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}

          {knowledge.length === 0 && (
            <p className="opacity-70">No merchant observations found.</p>
          )}
        </div>
      </section>

      <details className="border rounded p-4">
        <summary className="font-semibold">Raw JSON</summary>
        <pre className="mt-3 overflow-auto text-sm">
          {asJson({
            observations,
            knowledge,
          })}
        </pre>
      </details>
    </main>
  )
}
