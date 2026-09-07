export type AthDirection = 'sent' | 'received' | 'internal_transfer' | 'unknown'
export type AthParseStatus = 'parsed' | 'partial' | 'failed'

export type AthEmailParserInput = {
  subject: string | null
  plainText: string | null
  htmlText: string | null
  snippet: string | null
  emailReceivedAt: string
}

export type ParsedField = { value: unknown; found: boolean; pattern?: string }

export type ParsedAthEmail = {
  amountCents: number | null
  occurredAt: string | null
  timezone: 'America/Puerto_Rico'
  direction: AthDirection
  counterpartyName: string | null
  counterpartyPhoneLast4: string | null
  message: string | null
  reference: string | null
  sourceDescriptor: string | null
  destinationDescriptor: string | null
  parseStatus: AthParseStatus
  financialEvidence: boolean
  ignoreReason: string | null
  parserVersion: string
  fields: Record<string, ParsedField>
}

export type AthMatchReason = {
  code: string
  positive: boolean
  points: number
  message: string
}

export type AthEvidenceForMatching = ParsedAthEmail & {
  id: string
  householdId: string
}

export type PlaidAthCandidate = {
  id: string
  householdId: string
  amountCents: number
  signedAmountCents: number
  transactionDate: string
  merchant: string | null
  accountName: string | null
  accountMask: string | null
  reference?: string | null
  pending: boolean
  transactionStatus: string
  removedAt: string | null
  supersededAt: string | null
}

export type ScoredAthCandidate = {
  athEmailId: string
  plaidImportId: string
  score: number
  rank: number
  strength: 'strong' | 'possible' | 'weak'
  ambiguous: boolean
  timeDifferenceMinutes: number | null
  reasons: AthMatchReason[]
}
