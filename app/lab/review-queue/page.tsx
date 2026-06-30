import { requireUser } from '@/lib/auth/requireUser'
import { getReviewQueue, getSystemCategories } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'
import { ReviewQueueClient } from './ReviewQueueClient'

export const dynamic = 'force-dynamic'

export default async function LabReviewQueuePage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const queue = await getReviewQueue(supabase, user.id)
  const categoryOptions = getSystemCategories().map((category) => ({
    value: category.displayName,
    label: category.displayName,
    kind: category.kind,
  }))

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Review Queue</h1>
        <p className="text-sm opacity-70">
          Agrega movimientos claros al historial financiero y revisa los casos
          inciertos con los detalles técnicos guardados aparte.
        </p>
      </div>

      <ReviewQueueClient
        athReview={queue.athReview}
        candidates={queue.candidates}
        categoryOptions={categoryOptions}
        needsCategory={queue.needsCategory}
        needsManualReview={queue.needsManualReview}
        paymentConfirmation={queue.paymentConfirmation}
        possibleDuplicate={queue.possibleDuplicate}
        readyToConfirm={queue.readyToConfirm}
      />
    </main>
  )
}
