import ReviewQueuePage, { type ReviewQueueSearchParams } from '@/app/components/ReviewQueuePage'

export const dynamic = 'force-dynamic'

export default function RobototinaReviewPage({
  searchParams,
}: {
  searchParams?: Promise<ReviewQueueSearchParams>
}) {
  return <ReviewQueuePage searchParams={searchParams} />
}
