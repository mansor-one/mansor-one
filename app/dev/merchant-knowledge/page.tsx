import { requireUser } from '@/lib/auth/requireUser'
import {
  buildMerchantKnowledge,
  canonicalCategoryCodeForText,
  getCategoryByCode,
  getMerchantLearningState,
  type MerchantObservation,
  normalizeMerchantName,
} from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  MerchantKnowledgeExplorer,
  type MerchantKnowledgeExplorerObservation,
  type MerchantKnowledgeExplorerRow,
} from './MerchantKnowledgeExplorer'

export const dynamic = 'force-dynamic'

type SourceName = 'plaid_imports' | 'quick_entries'

type PlaidImportRow = {
  id: string
  plaid_transaction_id: string | null
  merchant: string | null
  amount: number | string | null
  suggested_category: string | null
  plaid_category: string | null
  transaction_date: string | null
  institution_name: string | null
  account_name: string | null
  account_mask: string | null
}

type QuickEntryRow = {
  id: string
  plaid_transaction_id: string | null
  description: string | null
  amount: number | string | null
  category: string | null
  entry_date: string | null
  account_name: string | null
}

type LiveMerchantObservation = MerchantObservation & {
  id: string
  source: SourceName
  legacyCategoryText: string | null
  rawMerchantName: string | null
  plaidTransactionId: string | null
  institutionName: string | null
  accountName: string | null
  accountMask: string | null
}

function categoryLabel(code: string | null) {
  if (!code) return 'None'
  const category = getCategoryByCode(code)
  return category ? `${category.displayName} (${category.code})` : code
}

function plaidObservation(row: PlaidImportRow): LiveMerchantObservation | null {
  const merchantName = row.merchant || row.plaid_category
  const legacyCategoryText = row.suggested_category
  const date = row.transaction_date

  if (!merchantName || !date) return null

  return {
    id: row.id,
    plaidTransactionId: row.plaid_transaction_id,
    source: 'plaid_imports',
    rawMerchantName: merchantName,
    merchantName,
    amount: Number(row.amount || 0),
    date,
    legacyCategoryText,
    canonicalCategoryCode: canonicalCategoryCodeForText(legacyCategoryText),
    isConfirmed: false,
    institutionName: row.institution_name,
    accountName: row.account_name,
    accountMask: row.account_mask,
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
    plaidTransactionId: row.plaid_transaction_id,
    source: 'quick_entries',
    rawMerchantName: merchantName,
    merchantName,
    amount: Number(row.amount || 0),
    date,
    legacyCategoryText,
    canonicalCategoryCode: canonicalCategoryCodeForText(legacyCategoryText),
    isConfirmed: true,
    institutionName: null,
    accountName: row.account_name,
    accountMask: null,
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

function explorerObservation(
  observation: LiveMerchantObservation
): MerchantKnowledgeExplorerObservation {
  return {
    id: observation.id,
    source: observation.source,
    rawMerchantName: observation.rawMerchantName,
    merchantName: observation.merchantName,
    plaidTransactionId: observation.plaidTransactionId,
    institutionName: observation.institutionName,
    accountName: observation.accountName,
    accountMask: observation.accountMask,
    amount: observation.amount,
    date: observation.date,
    legacyCategoryText: observation.legacyCategoryText,
    canonicalCategoryCode: observation.canonicalCategoryCode,
    isConfirmed: Boolean(observation.isConfirmed),
  }
}

export default async function DevMerchantKnowledgePage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)

  const [plaidResult, quickEntriesResult] = await Promise.all([
    supabase
      .from('plaid_imports')
      .select(
        'id, plaid_transaction_id, merchant, amount, suggested_category, plaid_category, transaction_date, institution_name, account_name, account_mask'
      )
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false })
      .limit(300),
    supabase
      .from('quick_entries')
      .select('id, plaid_transaction_id, description, amount, category, entry_date, account_name')
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
  const merchants: MerchantKnowledgeExplorerRow[] = groupObservations(
    observations
  )
    .map((group) => {
      const merchantKnowledge = buildMerchantKnowledge(group)
      const learningState = getMerchantLearningState(merchantKnowledge)

      return {
        ...merchantKnowledge,
        learningState,
        canonicalCategoryLabel: categoryLabel(
          merchantKnowledge.canonicalCategoryCode
        ),
        latestCategoryLabel: categoryLabel(merchantKnowledge.latestCategoryCode),
        sourceCounts: sourceCounts(group),
        legacyCategories: legacyCategorySummary(group),
        sourceMerchants: [
          ...new Set(
            group
              .map((item) => item.rawMerchantName)
              .filter((name): name is string => Boolean(name))
          ),
        ],
        observations: group.map(explorerObservation),
      }
    })
    .sort((a, b) => b.timesSeen - a.timesSeen || b.confidence - a.confidence)

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Merchant Knowledge</h1>
        <p className="text-sm opacity-70">
          Search learned merchants, inspect confidence, and verify which rows
          count toward learning.
        </p>
      </div>

      {(plaidResult.error || quickEntriesResult.error) && (
        <section className="border rounded p-4 text-red-600">
          <h2 className="text-xl font-bold">Source errors</h2>
          <pre className="mt-3 overflow-auto text-sm">
            {JSON.stringify(
              {
                plaid_imports: plaidResult.error,
                quick_entries: quickEntriesResult.error,
              },
              null,
              2
            )}
          </pre>
        </section>
      )}

      <MerchantKnowledgeExplorer merchants={merchants} />
    </main>
  )
}
