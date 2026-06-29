import { requireUser } from '@/lib/auth/requireUser'
import {
  getSystemCategories,
  getReviewQueue,
  type ReviewQueueCandidate,
} from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'
import { ReviewQueueCandidateActions } from './ReviewQueueCandidateActions'

export const dynamic = 'force-dynamic'

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function money(value: number | null | undefined) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

type CandidateActionMode =
  | 'readyToConfirm'
  | 'needsCategory'
  | 'possibleDuplicate'

type CategoryOption = {
  value: string
  label: string
}

function CandidateCard({
  candidate,
  actionMode = null,
  categories = [],
}: {
  candidate: ReviewQueueCandidate
  actionMode?: CandidateActionMode | null
  categories?: CategoryOption[]
}) {
  const suggestedPayment = candidate.paymentLifecycleContext
  const showReadyConfirm =
    actionMode === 'readyToConfirm' &&
    candidate.classification === 'readyToConfirm'
  const showCategoryConfirm =
    actionMode === 'needsCategory' &&
    candidate.classification === 'needsCategory'
  const showDuplicateConfirm =
    actionMode === 'possibleDuplicate' &&
    candidate.classification === 'possibleDuplicate' &&
    candidate.duplicateContext?.bestDuplicateMatch.matchType ===
      'plaid_transaction_id'

  return (
    <div className="border rounded p-4 space-y-3">
      <div>
        <h3 className="font-semibold">
          {candidate.merchant || 'Unknown merchant'}
        </h3>
        <p className="text-sm opacity-70">
          Priority {candidate.priority} · {candidate.classification} ·{' '}
          {candidate.transaction.date || 'No date'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div>
          <p className="font-semibold">Amount</p>
          <p>${money(candidate.transaction.amount)}</p>
        </div>
        <div>
          <p className="font-semibold">Confidence</p>
          <p>{percent(candidate.confidence)}</p>
        </div>
        <div>
          <p className="font-semibold">Identity</p>
          <p>{candidate.financialIdentity.identityType}</p>
        </div>
        <div>
          <p className="font-semibold">Suggested category</p>
          <p>
            {candidate.canonicalCategory?.displayName ||
              candidate.suggestedCategory ||
              'Needs category'}
          </p>
        </div>
        <div>
          <p className="font-semibold">Merchant knowledge</p>
          <p>
            {candidate.merchantKnowledge
              ? `${percent(candidate.merchantKnowledge.confidence)} · ${
                  candidate.merchantKnowledge.timesSeen
                } seen`
              : 'No knowledge'}
          </p>
        </div>
        <div>
          <p className="font-semibold">Suggested payment</p>
          <p>
            {suggestedPayment
              ? `${suggestedPayment.paymentName || 'Payment'} · $${money(
                  suggestedPayment.paymentAmount
                )} · ${suggestedPayment.status || 'unknown'}`
              : 'None'}
          </p>
        </div>
      </div>

      <ul className="list-disc pl-5 text-sm">
        {candidate.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      {showReadyConfirm && (
        <ReviewQueueCandidateActions
          mode="readyToConfirm"
          plaidImportId={candidate.transaction.id}
        />
      )}

      {showCategoryConfirm && (
        <ReviewQueueCandidateActions
          categories={categories}
          mode="needsCategory"
          plaidImportId={candidate.transaction.id}
        />
      )}

      {showDuplicateConfirm && (
        <ReviewQueueCandidateActions
          mode="possibleDuplicate"
          plaidImportId={candidate.transaction.id}
        />
      )}
    </div>
  )
}

function CandidateSection({
  title,
  candidates,
  actionMode = null,
  categories = [],
}: {
  title: string
  candidates: ReviewQueueCandidate[]
  actionMode?: CandidateActionMode | null
  categories?: CategoryOption[]
}) {
  return (
    <section className="border rounded p-4 space-y-3">
      <h2 className="text-xl font-bold">
        {title} ({candidates.length})
      </h2>

      <div className="space-y-3">
        {candidates.slice(0, 20).map((candidate) => (
          <CandidateCard
            actionMode={actionMode}
            candidate={candidate}
            categories={categories}
            key={candidate.id}
          />
        ))}

        {candidates.length === 0 && (
          <p className="opacity-70">No candidates.</p>
        )}

        {candidates.length > 20 && (
          <p className="text-sm opacity-70">
            Showing 20 of {candidates.length}.
          </p>
        )}
      </div>
    </section>
  )
}

function CompactCandidateList({
  candidates,
}: {
  candidates: ReviewQueueCandidate[]
}) {
  return (
    <section className="border rounded p-4 space-y-3">
      <h2 className="text-xl font-bold">Top 5 highest-priority candidates</h2>

      <div className="space-y-2">
        {candidates.slice(0, 5).map((candidate) => (
          <div
            className="border rounded p-3 text-sm grid grid-cols-1 md:grid-cols-5 gap-2"
            key={candidate.id}
          >
            <div>
              <p className="font-semibold">{candidate.merchant}</p>
              <p className="opacity-70">{candidate.transaction.date || 'No date'}</p>
            </div>
            <p>Priority {candidate.priority}</p>
            <p>{candidate.classification}</p>
            <p>{percent(candidate.confidence)} confidence</p>
            <p>
              {candidate.canonicalCategory?.displayName ||
                candidate.suggestedCategory ||
                'Needs category'}
            </p>
          </div>
        ))}

        {candidates.length === 0 && (
          <p className="opacity-70">No candidates.</p>
        )}
      </div>
    </section>
  )
}

export default async function LabReviewQueuePage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const queue = await getReviewQueue(supabase, user.id)
  const categoryOptions = getSystemCategories().map((category) => ({
    value: category.displayName,
    label: category.displayName,
  }))

  const statisticCards = [
    { label: 'Total candidates', value: queue.statistics.totalCandidates },
    { label: 'Ready to confirm', value: queue.readyToConfirm.length },
    { label: 'Needs category', value: queue.needsCategory.length },
    { label: 'Possible duplicate', value: queue.possibleDuplicate.length },
    { label: 'ATH review', value: queue.athReview.length },
    {
      label: 'Payment confirmation',
      value: queue.paymentConfirmation.length,
    },
    { label: 'Needs manual review', value: queue.needsManualReview.length },
  ]

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Lab Review Queue</h1>
        <p className="text-sm opacity-70">
          Read-only transaction review queue built from Ledger Summary v1.1.
          Import candidates are prepared here before they reach the confirmed
          ledger.
        </p>
      </div>

      <section className="border rounded p-4 bg-yellow-50 text-yellow-900">
        <h2 className="font-semibold">Limited write actions enabled</h2>
        <p className="text-sm">
          Ready import candidates, categorized import candidates, and direct
          Plaid duplicate matches can be handled here. ATH, payment, and manual
          review buckets remain read-only.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statisticCards.map((card) => (
          <div className="border rounded p-4" key={card.label}>
            <h2 className="font-semibold">{card.label}</h2>
            <p className="mt-3 text-3xl font-bold">{card.value}</p>
          </div>
        ))}
      </section>

      <CompactCandidateList candidates={queue.candidates} />

      <CandidateSection
        title="Queue by priority"
        candidates={queue.candidates}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <CandidateSection
          title="Payment confirmation"
          candidates={queue.paymentConfirmation}
        />
        <CandidateSection
          title="Possible duplicates"
          actionMode="possibleDuplicate"
          candidates={queue.possibleDuplicate}
        />
        <CandidateSection title="ATH review" candidates={queue.athReview} />
        <CandidateSection
          actionMode="needsCategory"
          candidates={queue.needsCategory}
          categories={categoryOptions}
          title="Needs category"
        />
        <CandidateSection
          title="Needs manual review"
          candidates={queue.needsManualReview}
        />
        <CandidateSection
          actionMode="readyToConfirm"
          title="Ready to confirm"
          candidates={queue.readyToConfirm}
        />
      </div>

      <details className="border rounded p-4">
        <summary className="font-semibold">Raw JSON</summary>
        <pre className="mt-3 overflow-auto text-sm">{asJson(queue)}</pre>
      </details>
    </main>
  )
}
