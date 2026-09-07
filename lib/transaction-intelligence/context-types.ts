export type TransactionContextPerson = {
  id: string
  name: string
  relationship?: string | null
}

export type TransactionContextReason = {
  code: string
  message: string
  matchedTerms: string[]
}

export type CanonicalCategoryCandidate = {
  categoryCode: string
  displayName: string
  purpose: string
  confidence: number
  rank: number
  reasons: TransactionContextReason[]
}

export type TransactionContextInterpretation = {
  evidence: {
    message: string | null
    counterparty: string | null
  }
  relatedPersonId: string | null
  relatedPersonName: string | null
  purpose: string | null
  categoryCandidates: CanonicalCategoryCandidate[]
  confidence: number
  reasons: TransactionContextReason[]
  ambiguous: boolean
  extractorVersion: string
  interpreterVersion: string
}

export type AthCandidateForEligibility = {
  id: string
  plaid_import_id: string
  score: number
  rank: number
  status: string
  reasons: unknown
}

type SchemaError = { code?: unknown }

export function isTransactionContextSchemaUnavailable(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as SchemaError
  return ['PGRST205', '42P01', '42703'].includes(String(candidate.code || ''))
}
