import { requireUser } from '@/lib/auth/requireUser'
import { getReviewQueue, getUniqueSystemCategoryOptions } from '@/lib/financial-engine'
import { getPlanningFunds } from '@/lib/financial-engine/planning-management'
import { paginateReviewQueue } from '@/lib/financial-engine/review-queue-pagination'
import { createServerSupabase } from '@/lib/supabase/server'
import { ReviewQueueClient } from '../lab/review-queue/ReviewQueueClient'
import AppShell from './AppShell'
import ReviewQueueBackAction from './ReviewQueueBackAction'

const reviewTabs = ['toReview', 'ready', 'duplicates', 'ath', 'all'] as const

export type ReviewQueueSearchParams = {
  tab?: string
  subset?: string
  year?: string
  month?: string
  transaction?: string
  page?: string
  q?: string
  category?: string
}

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams?: Promise<ReviewQueueSearchParams>
}) {
  const params = await searchParams
  const initialTab = reviewTabs.find((tab) => tab === params?.tab) || 'toReview'
  const requestedPage = Math.max(1, Number(params?.page) || 1)
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const [queue, planningFunds, peopleResult] = await Promise.all([
    getReviewQueue(supabase, user.id),
    getPlanningFunds(supabase, user.id),
    supabase.from('people').select('name').order('name'),
  ])
  const initialSubset = params?.subset === 'needs-category' || params?.subset === 'spending-excluded' || params?.subset === 'transaction' ? params.subset : undefined
  const spendingPeriod = params?.year && params?.month ? `${params.year}-${String(params.month).padStart(2, '0')}` : undefined
  const paginated = paginateReviewQueue({
    ...queue,
    tab: initialTab,
    subset: initialSubset,
    spendingPeriod,
    transactionId: params?.transaction,
    page: requestedPage,
    pageSize: 25,
    query: params?.q,
    category: params?.category,
  })

  return (
    <AppShell
      header={{
        backAction: <ReviewQueueBackAction />,
        breadcrumb: [
          { label: 'Robototina', href: '/robototina' },
          { label: 'Revisar transacciones' },
        ],
        eyebrow: 'Bandeja financiera',
        title: 'Revisar transacciones',
        subtitle: 'Decide qué representa cada movimiento antes de añadirlo a tu historial financiero.',
      }}
    >
      <section id="queue" tabIndex={-1}>
        <ReviewQueueClient
          key={JSON.stringify([initialTab, initialSubset, spendingPeriod, params?.transaction, paginated.page, params?.q, params?.category])}
          athReview={paginated.athReview}
          candidates={paginated.candidates}
          categoryOptions={getUniqueSystemCategoryOptions()}
          needsCategory={paginated.needsCategory}
          needsManualReview={paginated.needsManualReview}
          paymentConfirmation={paginated.paymentConfirmation}
          possibleDuplicate={paginated.possibleDuplicate}
          readyToConfirm={paginated.readyToConfirm}
          initialTab={initialTab}
          initialSubset={initialSubset}
          spendingPeriod={spendingPeriod}
          pagination={{ page: paginated.page, pageCount: paginated.pageCount, pageSize: paginated.pageSize, totalGroups: paginated.totalGroups }}
          globalCounts={paginated.counts}
          planningFunds={planningFunds
            .filter((item) => !item.is_archived && !item.is_completed && !['archived', 'completed'].includes(item.status))
            .map((item) => ({ id: item.id, name: item.name }))}
          owners={[...new Set((peopleResult.data || []).map((person) => person.name).filter(Boolean))]}
          transactionId={params?.transaction}
        />
      </section>
    </AppShell>
  )
}
