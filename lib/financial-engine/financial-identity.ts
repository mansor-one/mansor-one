export type FinancialIdentityType =
  | 'merchant'
  | 'person'
  | 'institution'
  | 'utility'
  | 'subscription'
  | 'loan'
  | 'credit_card_payment'
  | 'transfer'
  | 'income'
  | 'fee'
  | 'interest'
  | 'refund'
  | 'unknown'

export type FinancialIdentitySource = 'plaid_imports' | 'quick_entries'

export interface FinancialIdentityObservation {
  id: string
  source: FinancialIdentitySource
  name: string | null
  amount: number
  date: string | null
}

export interface FinancialIdentity {
  normalizedIdentity: string
  identityType: FinancialIdentityType
  sourceNames: string[]
  sourceCounts: Record<FinancialIdentitySource, number>
  exampleAmounts: number[]
  lastSeen: string | null
  confidence: number
  shouldReview: boolean
  observations: FinancialIdentityObservation[]
}

const PERSON_PATTERNS = ['SORAYA', 'GABRIELA', 'GABY', 'NIKO']

function includesAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern))
}

export function normalizeFinancialIdentityName(
  name: string | null | undefined
) {
  return String(name || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' AND ')
    .replace(/[#*]\s*\d+/g, ' ')
    .replace(/\bSTORE\b/g, ' ')
    .replace(/\bPR\b/g, ' ')
    .replace(/\bPUERTO RICO\b/g, ' ')
    .replace(/\bINC\b/g, ' ')
    .replace(/\bLLC\b/g, ' ')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function classifyFinancialIdentity(
  name: string | null | undefined
): FinancialIdentityType {
  const normalizedName = normalizeFinancialIdentityName(name)

  if (!normalizedName || normalizedName === 'UNKNOWN') return 'unknown'

  if (includesAny(normalizedName, ['INTEREST CHARGE', 'IOD INTEREST'])) {
    return 'interest'
  }

  if (includesAny(normalizedName, ['RETURNED PAYMENT FEE'])) {
    return 'fee'
  }

  if (
    includesAny(normalizedName, [
      'EFT PMT',
      'CREDIT CARD PAYMENT',
      'CR CARD PAYMENT',
      'CARDMEMBER',
      'POPULAR CR CARD PAYMENT',
      'U S BANK RETRY PYMT',
    ])
  ) {
    return 'credit_card_payment'
  }

  if (
    includesAny(normalizedName, [
      'ATH MOVIL',
      'TRANF ATHM',
      'ATHM',
      'TRANSFER',
      'TRANSFERENCIA',
    ])
  ) {
    if (includesAny(normalizedName, PERSON_PATTERNS)) return 'person'
    return 'transfer'
  }

  if (includesAny(normalizedName, PERSON_PATTERNS)) return 'person'

  if (
    includesAny(normalizedName, ['CHECK DEPOSIT', 'PAYROLL', 'NOMINA'])
  ) {
    return 'income'
  }

  if (includesAny(normalizedName, ['REFUND', 'REVERSAL'])) {
    return 'refund'
  }

  if (includesAny(normalizedName, ['LUMA'])) return 'utility'

  if (includesAny(normalizedName, ['COOP LARES'])) return 'loan'

  if (
    includesAny(normalizedName, ['OPENAI', 'APPLE', 'NINTENDO'])
  ) {
    return 'subscription'
  }

  if (
    includesAny(normalizedName, [
      'FIRSTBANK',
      'BANCO POPULAR',
      'POPULAR BANK',
      'US BANK',
      'U S BANK',
      'CHASE',
      'SYNCHRONY',
    ])
  ) {
    return 'institution'
  }

  if (
    includesAny(normalizedName, [
      'WALGREENS',
      'AMAZON',
      'WALMART',
      'COSTCO',
    ])
  ) {
    return 'merchant'
  }

  return 'unknown'
}

export function isFinancialEvent(identityType: FinancialIdentityType) {
  return [
    'credit_card_payment',
    'transfer',
    'income',
    'fee',
    'interest',
    'refund',
  ].includes(identityType)
}

export function needsIdentityReview(identity: FinancialIdentity) {
  return identity.identityType === 'unknown' || identity.confidence < 0.6
}

function confidenceForIdentity(
  identityType: FinancialIdentityType,
  observationsCount: number
) {
  if (identityType === 'unknown') return 0.2

  let confidence = 0.55

  if (isFinancialEvent(identityType)) confidence += 0.15
  if (observationsCount >= 3) confidence += 0.15
  if (observationsCount >= 5) confidence += 0.1

  return Math.min(Number(confidence.toFixed(2)), 0.95)
}

export function buildFinancialIdentities(
  observations: FinancialIdentityObservation[]
) {
  const groups = new Map<string, FinancialIdentityObservation[]>()

  observations.forEach((observation) => {
    const normalizedIdentity = normalizeFinancialIdentityName(observation.name)
    if (!normalizedIdentity) return

    const group = groups.get(normalizedIdentity) || []
    group.push(observation)
    groups.set(normalizedIdentity, group)
  })

  return [...groups.entries()]
    .map(([normalizedIdentity, group]): FinancialIdentity => {
      const identityType = classifyFinancialIdentity(normalizedIdentity)
      const sortedDates = group
        .map((observation) => observation.date)
        .filter((date): date is string => Boolean(date))
        .sort()
      const confidence = confidenceForIdentity(identityType, group.length)
      const sourceCounts = group.reduce(
        (counts, observation) => ({
          ...counts,
          [observation.source]: counts[observation.source] + 1,
        }),
        {
          plaid_imports: 0,
          quick_entries: 0,
        } as Record<FinancialIdentitySource, number>
      )
      const identity: FinancialIdentity = {
        normalizedIdentity,
        identityType,
        sourceNames: [
          ...new Set(
            group
              .map((observation) => observation.name)
              .filter((name): name is string => Boolean(name))
          ),
        ],
        sourceCounts,
        exampleAmounts: group
          .slice(0, 5)
          .map((observation) => Number(observation.amount || 0)),
        lastSeen: sortedDates.at(-1) || null,
        confidence,
        shouldReview: false,
        observations: group,
      }

      return {
        ...identity,
        shouldReview: needsIdentityReview(identity),
      }
    })
    .sort(
      (a, b) =>
        b.sourceCounts.plaid_imports +
          b.sourceCounts.quick_entries -
          (a.sourceCounts.plaid_imports + a.sourceCounts.quick_entries) ||
        a.normalizedIdentity.localeCompare(b.normalizedIdentity)
    )
}
