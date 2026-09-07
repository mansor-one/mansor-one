import type { AthCandidateForEligibility } from './context-types.ts'

export const ATH_CONTEXT_MATCH_THRESHOLDS = {
  strongScore: 85,
  ambiguityMargin: 5,
  requiredRank: 1,
} as const

function reasons(value: unknown) {
  return Array.isArray(value) ? value.filter((reason): reason is Record<string, unknown> => Boolean(reason && typeof reason === 'object')) : []
}

function hasPositiveReason(candidate: AthCandidateForEligibility, code: string) {
  return reasons(candidate.reasons).some((reason) => reason.code === code && reason.positive === true)
}

export function isAthEvidenceEligible(
  candidate: AthCandidateForEligibility,
  candidatesForEmail: AthCandidateForEligibility[]
) {
  if (candidate.status === 'confirmed') return true
  if (candidate.status !== 'suggested') return false
  if (candidate.rank !== ATH_CONTEXT_MATCH_THRESHOLDS.requiredRank) return false
  if (candidate.score < ATH_CONTEXT_MATCH_THRESHOLDS.strongScore) return false
  if (!hasPositiveReason(candidate, 'amount_exact')) return false
  if (!hasPositiveReason(candidate, 'direction_compatible')) return false
  if (!hasPositiveReason(candidate, 'ambiguity')) return false

  return !candidatesForEmail.some((other) =>
    other.id !== candidate.id &&
    other.status === 'suggested' &&
    other.score >= candidate.score - ATH_CONTEXT_MATCH_THRESHOLDS.ambiguityMargin
  )
}

export function selectEligibleAthEvidence(candidates: AthCandidateForEligibility[]) {
  const confirmed = candidates.find((candidate) => candidate.status === 'confirmed')
  if (confirmed) return confirmed
  const primary = candidates.find((candidate) => candidate.rank === ATH_CONTEXT_MATCH_THRESHOLDS.requiredRank)
  return primary && isAthEvidenceEligible(primary, candidates) ? primary : null
}

