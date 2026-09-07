import type { AthMatchReason } from '@/lib/ath-movil/types'

export type LegacyReviewSchedule = {
  id: string
  household_id: string
  name: string
  owner: string | null
  amount: number | null
}

export type LegacyReviewAthEmail = {
  id: string
  household_id: string
  occurred_at: string | null
  email_date: string | null
  direction: string | null
  counterparty_name: string | null
  amount: number | null
  message: string | null
  subject: string | null
  is_ignored: boolean | null
}

export type LegacyReviewPlaidCandidate = {
  id: string
  plaidImportId: string
  score: number
  rank: number
  status: string
  reasons: AthMatchReason[]
  amount: number | null
  transactionDate: string | null
  merchant: string | null
  institutionName: string | null
  accountName: string | null
}

export type LegacyReviewEvidence = LegacyReviewAthEmail & {
  candidates: LegacyReviewPlaidCandidate[]
  ambiguous: boolean
}

export type LegacyObligationReview = {
  schedule: LegacyReviewSchedule
  expectedDate: string
  possiblePayments: LegacyReviewEvidence[]
  possibleReimbursements: LegacyReviewEvidence[]
  ambiguous: boolean
}

export type LegacyReviewPaymentClassification =
  | 'current'
  | 'previous'
  | 'complement'
  | 'unclassified'

export type LegacyReviewLocalPaymentDecision = {
  classification: LegacyReviewPaymentClassification
  complementsPaymentId?: string
}

export function summarizeLegacyReviewDecisions(
  review: LegacyObligationReview,
  decisions: Record<string, LegacyReviewLocalPaymentDecision>
) {
  const selectedPayments = review.possiblePayments.flatMap((payment) => {
    const decision = decisions[payment.id]
    return decision ? [{ payment, decision }] : []
  })
  const currentCycleTotal = selectedPayments.reduce((total, item) =>
    item.decision.classification === 'current' || item.decision.classification === 'complement'
      ? total + Math.abs(Number(item.payment.amount || 0))
      : total, 0)
  const previousPeriodTotal = selectedPayments.reduce((total, item) =>
    item.decision.classification === 'previous'
      ? total + Math.abs(Number(item.payment.amount || 0))
      : total, 0)

  return { selectedPayments, currentCycleTotal, previousPeriodTotal }
}

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function contextTokens(value: unknown) {
  return [...new Set(normalize(value).split(' ').filter((token) => token.length >= 3))]
}

function evidenceText(email: LegacyReviewAthEmail) {
  return normalize([email.message, email.subject, email.counterparty_name].filter(Boolean).join(' '))
}

function occurredAt(email: LegacyReviewAthEmail) {
  return email.occurred_at || email.email_date || ''
}

function isHouseholdEvidence(
  schedule: LegacyReviewSchedule,
  email: LegacyReviewAthEmail
) {
  return email.household_id === schedule.household_id && !email.is_ignored
}

function paymentContextScore(
  schedule: LegacyReviewSchedule,
  email: LegacyReviewAthEmail
) {
  if (!isHouseholdEvidence(schedule, email) || email.direction !== 'sent') return 0

  const haystack = evidenceText(email)
  const nameMatches = contextTokens(schedule.name).filter((token) =>
    haystack.includes(token)
  ).length
  const owner = normalize(schedule.owner)
  const counterparty = normalize(email.counterparty_name)
  const ownerMatch = Boolean(owner && (
    counterparty === owner || haystack.includes(owner)
  ))

  return (nameMatches > 0 ? 4 + Math.min(nameMatches - 1, 2) : 0) +
    (ownerMatch ? 3 : 0) +
    (Number(email.amount || 0) > 0 ? 1 : 0)
}

function reimbursementContextScore(
  schedule: LegacyReviewSchedule,
  email: LegacyReviewAthEmail,
  payments: LegacyReviewAthEmail[]
) {
  if (!isHouseholdEvidence(schedule, email) || email.direction !== 'received') return 0

  const owner = normalize(schedule.owner)
  const counterparty = normalize(email.counterparty_name)
  const haystack = evidenceText(email)
  const ownerMatch = Boolean(owner && (
    counterparty === owner || haystack.includes(owner)
  ))
  if (!ownerMatch) return 0

  const paymentAmounts = new Set(
    payments.map((payment) => Math.abs(Number(payment.amount || 0)).toFixed(2))
  )
  const amountMatch = paymentAmounts.has(
    Math.abs(Number(email.amount || 0)).toFixed(2)
  )

  return 4 + (amountMatch ? 3 : 0)
}

function candidateIsAmbiguous(candidate: LegacyReviewPlaidCandidate) {
  return candidate.reasons.some((reason) =>
    reason.code === 'ambiguity' && reason.positive === false
  )
}

function attachCandidates(
  email: LegacyReviewAthEmail,
  candidatesByEmail: Map<string, LegacyReviewPlaidCandidate[]>
): LegacyReviewEvidence {
  const candidates = [...(candidatesByEmail.get(email.id) || [])]
    .sort((left, right) => left.rank - right.rank || right.score - left.score)
  const pending = candidates.filter((candidate) => candidate.status === 'suggested')
  return {
    ...email,
    candidates,
    ambiguous: pending.length > 1 || pending.some(candidateIsAmbiguous),
  }
}

export function buildLegacyObligationReview({
  schedule,
  expectedDate,
  emails,
  candidatesByEmail = new Map(),
}: {
  schedule: LegacyReviewSchedule
  expectedDate: string
  emails: LegacyReviewAthEmail[]
  candidatesByEmail?: Map<string, LegacyReviewPlaidCandidate[]>
}): LegacyObligationReview {
  const possiblePaymentRows = emails
    .filter((email) => paymentContextScore(schedule, email) >= 4)
    .sort((left, right) => occurredAt(left).localeCompare(occurredAt(right)))

  const firstPaymentAt = possiblePaymentRows[0]
    ? occurredAt(possiblePaymentRows[0])
    : expectedDate
  const possibleReimbursementRows = emails
    .filter((email) => occurredAt(email) > firstPaymentAt)
    .filter((email) => reimbursementContextScore(schedule, email, possiblePaymentRows) >= 4)
    .sort((left, right) => occurredAt(left).localeCompare(occurredAt(right)))

  const possiblePayments = possiblePaymentRows.map((email) =>
    attachCandidates(email, candidatesByEmail)
  )
  const possibleReimbursements = possibleReimbursementRows.map((email) =>
    attachCandidates(email, candidatesByEmail)
  )

  return {
    schedule,
    expectedDate,
    possiblePayments,
    possibleReimbursements,
    ambiguous: possiblePayments.length !== 1 ||
      possiblePayments.some((payment) => payment.ambiguous),
  }
}
