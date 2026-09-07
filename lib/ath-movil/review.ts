import type { AthMatchReason } from './types'
import { chunkValues } from '../batching.ts'

export const ATH_REVIEW_PAGE_SIZE = 25
export const ATH_REVIEW_QUERY_BATCH_SIZE = 100
export const ATH_HIGH_CONFIDENCE_SCORE = 85

export type AthReviewFilter =
  | 'exceptions'
  | 'pending'
  | 'high-confidence'
  | 'ambiguous'
  | 'no-match'
  | 'confirmed'
  | 'rejected'
  | 'internal-transfer'
  | 'sent'
  | 'received'

export type AthReviewCandidateStatus =
  | 'suggested'
  | 'confirmed'
  | 'rejected'
  | 'superseded'
  | 'stale'

export type AthReviewCandidateLike = {
  id: string
  status: string
  rank: number
  score: number
  reasons?: unknown
}

function isStoredAmbiguous(candidates: AthReviewCandidateLike[]) {
  return candidates.some((candidate) => Array.isArray(candidate.reasons) && candidate.reasons.some((reason) => Boolean(
    reason && typeof reason === 'object' && 'code' in reason && reason.code === 'ambiguity' && 'positive' in reason && reason.positive === false
  )))
}

export type AthReviewEmailLike = {
  id: string
  direction: string | null
  is_ignored: boolean | null
}

export function chunkAthReviewIds<T>(values: T[], size = ATH_REVIEW_QUERY_BATCH_SIZE) {
  return chunkValues(values, size)
}

export function parseAthReviewFilter(value?: string): AthReviewFilter {
  const allowed: AthReviewFilter[] = [
    'exceptions', 'pending', 'high-confidence', 'ambiguous', 'no-match', 'confirmed',
    'rejected', 'internal-transfer', 'sent', 'received',
  ]
  return allowed.includes(value as AthReviewFilter) ? value as AthReviewFilter : 'exceptions'
}

export function parseAthReviewPage(value?: string) {
  const page = Number.parseInt(value || '1', 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

export function candidateReasons(value: unknown): AthMatchReason[] {
  if (!Array.isArray(value)) return []
  return value.filter((reason): reason is AthMatchReason => Boolean(
    reason && typeof reason === 'object' &&
    'code' in reason && typeof reason.code === 'string' &&
    'message' in reason && typeof reason.message === 'string' &&
    'positive' in reason && typeof reason.positive === 'boolean' &&
    'points' in reason && typeof reason.points === 'number'
  ))
}

export function athEmailReviewState(email: AthReviewEmailLike, candidates: AthReviewCandidateLike[]) {
  if (email.is_ignored) return 'ignored' as const
  if (candidates.some((candidate) => candidate.status === 'confirmed')) return 'confirmed' as const
  if (candidates.some((candidate) => candidate.status === 'suggested')) return 'pending' as const
  if (candidates.some((candidate) => candidate.status === 'rejected')) return 'rejected' as const
  if (candidates.some((candidate) => candidate.status === 'superseded')) return 'superseded' as const
  return 'no-match' as const
}

export function matchesAthReviewFilter(
  email: AthReviewEmailLike,
  candidates: AthReviewCandidateLike[],
  filter: AthReviewFilter
) {
  const pending = candidates.filter((candidate) => candidate.status === 'suggested')
  const state = athEmailReviewState(email, candidates)
  const ambiguous = isStoredAmbiguous(pending)
  if (filter === 'exceptions') {
    return state === 'no-match' || state === 'rejected' || ambiguous || (pending.length > 0 && Math.max(...pending.map((item) => item.score)) < ATH_HIGH_CONFIDENCE_SCORE)
  }
  if (filter === 'pending') return state === 'pending'
  if (filter === 'high-confidence') return pending.some((item) => item.rank === 1 && item.score >= ATH_HIGH_CONFIDENCE_SCORE) && !ambiguous
  if (filter === 'ambiguous') return ambiguous
  if (filter === 'no-match') return state === 'no-match'
  if (filter === 'confirmed') return state === 'confirmed'
  if (filter === 'rejected') return state === 'rejected'
  if (filter === 'internal-transfer') return email.direction === 'internal_transfer'
  return email.direction === filter
}
