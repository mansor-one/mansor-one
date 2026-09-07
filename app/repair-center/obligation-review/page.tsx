import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/requireUser'
import { chunkAthReviewIds, candidateReasons } from '@/lib/ath-movil/review'
import {
  buildLegacyObligationReview,
  type LegacyReviewPlaidCandidate,
} from '@/lib/financial-engine/legacy-obligation-review'
import AppShell from '@/app/components/AppShell'
import LegacyObligationReviewPreview from './LegacyObligationReviewPreview'

export const dynamic = 'force-dynamic'

type SearchParams = {
  scheduledPaymentId?: string
  expectedDate?: string
}

function validDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function dateOffset(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export default async function LegacyObligationReviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  if (!params.scheduledPaymentId || !validDate(params.expectedDate)) notFound()

  const expectedDate = params.expectedDate as string
  const { supabase, user } = await requireUser()
  const { data: membership, error: membershipError } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membership?.household_id) notFound()

  const householdId = membership.household_id
  const { data: schedule, error: scheduleError } = await supabase
    .from('scheduled_payments')
    .select('id, household_id, name, owner, amount')
    .eq('id', params.scheduledPaymentId)
    .eq('household_id', householdId)
    .maybeSingle()
  if (scheduleError) throw scheduleError
  if (!schedule) notFound()

  const windowStart = `${dateOffset(expectedDate, -45)}T00:00:00.000Z`
  const windowEnd = `${dateOffset(expectedDate, 45)}T23:59:59.999Z`
  const { data: emails, error: emailsError } = await supabase
    .from('ath_movil_emails')
    .select('id, household_id, occurred_at, email_date, direction, counterparty_name, amount, message, subject, is_ignored')
    .eq('household_id', householdId)
    .gte('occurred_at', windowStart)
    .lte('occurred_at', windowEnd)
    .order('occurred_at')
    .limit(200)
  if (emailsError) throw emailsError

  const emailIds = (emails || []).map((email) => email.id)
  const candidateResults = await Promise.all(
    chunkAthReviewIds(emailIds).map((idBatch) =>
      supabase
        .from('ath_movil_match_candidates')
        .select('id, household_id, ath_email_id, plaid_import_id, score, rank, status, reasons')
        .eq('household_id', householdId)
        .in('ath_email_id', idBatch)
        .order('rank')
    )
  )
  const candidates = candidateResults.flatMap((result) => {
    if (result.error) throw result.error
    return result.data || []
  })
  const plaidIds = [...new Set(candidates.map((candidate) => candidate.plaid_import_id))]
  const plaidResults = await Promise.all(
    chunkAthReviewIds(plaidIds).map((idBatch) =>
      supabase
        .from('plaid_imports')
        .select('id, household_id, amount, transaction_date, merchant, institution_name, account_name')
        .eq('household_id', householdId)
        .in('id', idBatch)
    )
  )
  const plaidImports = plaidResults.flatMap((result) => {
    if (result.error) throw result.error
    return result.data || []
  })
  const plaidById = new Map(plaidImports.map((item) => [item.id, item]))
  const candidatesByEmail = new Map<string, LegacyReviewPlaidCandidate[]>()
  for (const candidate of candidates) {
    const plaid = plaidById.get(candidate.plaid_import_id)
    if (!plaid || plaid.household_id !== householdId) continue
    const mapped: LegacyReviewPlaidCandidate = {
      id: candidate.id,
      plaidImportId: candidate.plaid_import_id,
      score: candidate.score,
      rank: candidate.rank,
      status: candidate.status,
      reasons: candidateReasons(candidate.reasons),
      amount: plaid.amount,
      transactionDate: plaid.transaction_date,
      merchant: plaid.merchant,
      institutionName: plaid.institution_name,
      accountName: plaid.account_name,
    }
    const list = candidatesByEmail.get(candidate.ath_email_id) || []
    list.push(mapped)
    candidatesByEmail.set(candidate.ath_email_id, list)
  }

  const review = buildLegacyObligationReview({
    schedule,
    expectedDate,
    emails: emails || [],
    candidatesByEmail,
  })

  return (
    <AppShell
      header={{
        eyebrow: 'Payment Lifecycle · revisión manual',
        title: 'Explorar evidencia de una obligación',
        subtitle: 'Vista local para comprender pagos, ambigüedad y posibles reimbursements sin modificar datos.',
        secondaryAction: (
          <Link className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200" href="/repair-center">
            Volver a Repair
          </Link>
        ),
      }}
    >
      <LegacyObligationReviewPreview review={review} />
    </AppShell>
  )
}
