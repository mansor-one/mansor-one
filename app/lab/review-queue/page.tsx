import { requireUser } from '@/lib/auth/requireUser'
import { getReviewQueue, getSystemCategories } from '@/lib/financial-engine'
import { getPlanningFunds } from '@/lib/financial-engine/planning-management'
import { createServerSupabase } from '@/lib/supabase/server'
import { ReviewQueueClient } from './ReviewQueueClient'

export const dynamic = 'force-dynamic'

const reviewTabs = ['toReview', 'ready', 'duplicates', 'ath', 'all'] as const

export default async function LabReviewQueuePage({ searchParams }: { searchParams?: Promise<{ tab?: string; subset?: string; year?: string; month?: string; transaction?: string }> }) {
  const params = await searchParams
  const initialTab = reviewTabs.find((tab) => tab === params?.tab) || 'toReview'
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const [queue, planningFunds, peopleResult] = await Promise.all([
    getReviewQueue(supabase, user.id),
    getPlanningFunds(supabase, user.id),
    supabase.from('people').select('name').order('name'),
  ])
  const categoryOptions = getSystemCategories().map((category) => ({
    value: category.displayName,
    label: category.displayName,
    kind: category.kind,
  }))

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Review transactions</h1>
        <p className="text-sm opacity-70">
          Decide what each transaction represents before adding it to your financial history.
        </p>
      </div>

      <section id="queue">
        <ReviewQueueClient
          athReview={queue.athReview}
          candidates={queue.candidates}
          categoryOptions={categoryOptions}
          needsCategory={queue.needsCategory}
          needsManualReview={queue.needsManualReview}
          paymentConfirmation={queue.paymentConfirmation}
          possibleDuplicate={queue.possibleDuplicate}
          readyToConfirm={queue.readyToConfirm}
          initialTab={initialTab}
          initialSubset={params?.subset === 'needs-category' || params?.subset === 'spending-excluded' || params?.subset === 'transaction' ? params.subset : undefined}
          spendingPeriod={params?.year && params?.month ? `${params.year}-${String(params.month).padStart(2, '0')}` : undefined}
          planningFunds={planningFunds
            .filter((item) => !item.is_archived && !item.is_completed && !['archived', 'completed'].includes(item.status))
            .map((item) => ({ id: item.id, name: item.name }))}
          owners={[...new Set((peopleResult.data || []).map((person) => person.name).filter(Boolean))]}
          transactionId={params?.transaction}
        />
      </section>
    </main>
  )
}
