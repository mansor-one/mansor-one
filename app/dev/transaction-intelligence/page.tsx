import { requireUser } from '@/lib/auth/requireUser'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type SuggestionStatus =
  | 'suggested'
  | 'needs_review'
  | 'confirmed'
  | 'rejected'
  | 'ignored'

type ReviewStatus = 'pending' | 'resolved' | 'ignored'

type TransactionSuggestionRow = {
  id: string
  quick_entry_id: string | null
  plaid_import_id: string | null
  source: string
  suggested_category: string
  confidence_score: number | null
  reason: string | null
  status: SuggestionStatus
  created_at: string
  updated_at: string
}

type TransactionReviewItemRow = {
  id: string
  suggestion_id: string
  question: string
  status: ReviewStatus
  answer: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

const suggestionStatuses: SuggestionStatus[] = [
  'suggested',
  'needs_review',
  'confirmed',
  'rejected',
  'ignored',
]

const reviewStatuses: ReviewStatus[] = ['pending', 'resolved', 'ignored']

function countByStatus<T extends string>(
  rows: Array<{ status: T }>,
  statuses: T[]
) {
  return statuses.map((status) => ({
    status,
    count: rows.filter((row) => row.status === status).length,
  }))
}

function formatValue(value: string | number | null) {
  if (value === null || value === '') return 'N/A'
  return value
}

export default async function DevTransactionIntelligencePage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)

  const [
    suggestionsResult,
    reviewItemsResult,
    latestSuggestionsResult,
    latestReviewItemsResult,
    activeRulesResult,
  ] = await Promise.all([
    supabase
      .from('transaction_suggestions')
      .select('status')
      .eq('user_id', user.id),
    supabase
      .from('transaction_review_items')
      .select('status')
      .eq('user_id', user.id),
    supabase
      .from('transaction_suggestions')
      .select(
        'id, quick_entry_id, plaid_import_id, source, suggested_category, confidence_score, reason, status, created_at, updated_at'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('transaction_review_items')
      .select(
        'id, suggestion_id, question, status, answer, resolved_at, created_at, updated_at'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('transaction_rules')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true),
  ])

  const errors = [
    suggestionsResult.error,
    reviewItemsResult.error,
    latestSuggestionsResult.error,
    latestReviewItemsResult.error,
    activeRulesResult.error,
  ].filter(Boolean)

  const suggestionRows = (suggestionsResult.data ||
    []) as Array<{ status: SuggestionStatus }>
  const reviewRows = (reviewItemsResult.data ||
    []) as Array<{ status: ReviewStatus }>
  const latestSuggestions = (latestSuggestionsResult.data ||
    []) as TransactionSuggestionRow[]
  const latestReviewItems = (latestReviewItemsResult.data ||
    []) as TransactionReviewItemRow[]

  const suggestionCounts = countByStatus(
    suggestionRows,
    suggestionStatuses
  )
  const reviewCounts = countByStatus(reviewRows, reviewStatuses)
  const activeRulesCount = activeRulesResult.count || 0

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          Dev Transaction Intelligence
        </h1>
        <p className="text-sm opacity-70">
          Read-only developer view for transaction review queue v1.
        </p>
      </div>

      {errors.length > 0 && (
        <section className="border rounded p-4 text-red-600">
          <h2 className="text-xl font-bold">Errors</h2>
          <pre className="mt-3 overflow-auto text-sm">
            {JSON.stringify(errors, null, 2)}
          </pre>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">transaction_suggestions</h2>
          <div className="mt-3 space-y-1">
            {suggestionCounts.map((item) => (
              <p key={item.status}>
                {item.status}: {item.count}
              </p>
            ))}
          </div>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">transaction_review_items</h2>
          <div className="mt-3 space-y-1">
            {reviewCounts.map((item) => (
              <p key={item.status}>
                {item.status}: {item.count}
              </p>
            ))}
          </div>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">active transaction_rules</h2>
          <p className="mt-3 text-3xl font-bold">{activeRulesCount}</p>
        </div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Latest suggestions</h2>

        <div className="space-y-3">
          {latestSuggestions.map((suggestion) => (
            <div key={suggestion.id} className="border rounded p-3">
              <h3 className="font-semibold">
                {suggestion.suggested_category}
              </h3>
              <p>Source: {suggestion.source}</p>
              <p>Status: {suggestion.status}</p>
              <p>Confidence: {formatValue(suggestion.confidence_score)}</p>
              <p>Reason: {formatValue(suggestion.reason)}</p>
              <p>Quick entry: {formatValue(suggestion.quick_entry_id)}</p>
              <p>Plaid import: {formatValue(suggestion.plaid_import_id)}</p>
              <p>Created: {suggestion.created_at}</p>
            </div>
          ))}

          {latestSuggestions.length === 0 && (
            <p className="opacity-70">No suggestions yet.</p>
          )}
        </div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Latest review items</h2>

        <div className="space-y-3">
          {latestReviewItems.map((item) => (
            <div key={item.id} className="border rounded p-3">
              <h3 className="font-semibold">{item.question}</h3>
              <p>Status: {item.status}</p>
              <p>Answer: {formatValue(item.answer)}</p>
              <p>Suggestion: {item.suggestion_id}</p>
              <p>Resolved: {formatValue(item.resolved_at)}</p>
              <p>Created: {item.created_at}</p>
            </div>
          ))}

          {latestReviewItems.length === 0 && (
            <p className="opacity-70">No review items yet.</p>
          )}
        </div>
      </section>
    </main>
  )
}
