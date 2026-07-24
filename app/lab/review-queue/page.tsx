import ReviewQueuePage, { type ReviewQueueSearchParams } from '@/app/components/ReviewQueuePage'

export const dynamic = 'force-dynamic'

export default function LabReviewQueuePage({
  searchParams,
}: {
  searchParams?: Promise<ReviewQueueSearchParams>
}) {
  return <ReviewQueuePage searchParams={searchParams} />
}
