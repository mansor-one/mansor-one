import { normalizeMerchantAlias } from './merchant-normalization'

export type FinancialIdentityType =
  | 'merchant'
  | 'person'
  | 'institution'
  | 'utility'
  | 'subscription'
  | 'loan'
  | 'credit_card_payment'
  | 'bank_fee'
  | 'government'
  | 'person_transfer'
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

export interface FinancialIdentitySignalInput {
  name: string | null | undefined
  institutionName?: string | null
  accountName?: string | null
  accountType?: string | null
  accountSubtype?: string | null
  paymentMethod?: string | null
  category?: string | null
  amount?: number | null
  date?: string | null
}

export interface FinancialIdentityAnalysis {
  normalizedIdentity: string
  identityType: FinancialIdentityType
  confidence: number
  shouldReview: boolean
  canonicalCategoryCode: string | null
  reasons: string[]
}

const PERSON_PATTERNS = ['SORAYA', 'GABRIELA', 'GABY', 'NIKO', 'MANUEL']
const CREDIT_ACCOUNT_PATTERNS = [
  'CREDIT',
  'CREDIT CARD',
  'CARD',
  'VISA',
  'MASTERCARD',
  'AMEX',
  'AMERICAN EXPRESS',
  'SYNCHRONY',
]
const CREDIT_PAYMENT_PATTERNS = [
  'INTERNET PAYMENT THANK YOU',
  'CR CARD PAYMENT',
  'CREDIT CARD PAYMENT',
  'EFT PMT',
  'ONLINE PAYMENT',
  'PAYMENT RECEIVED',
  'PAYMENT THANK YOU',
  'CARDMEMBER',
  'POPULAR CR CARD PAYMENT',
  'U S BANK RETRY PYMT',
]
const CLEAR_CARD_PAYMENT_PATTERNS = [
  'CR CARD PAYMENT',
  'CREDIT CARD PAYMENT',
  'CARDMEMBER',
  'POPULAR CR CARD PAYMENT',
]
const BANK_FEE_PATTERNS = [
  'RETURNED PAYMENT FEE',
  'NSF FEE',
  'OVERDRAFT FEE',
  'LATE FEE',
  'INTEREST CHARGE',
]
const GOVERNMENT_PATTERNS = [
  'CESCO',
  'DMV',
  'MARBET',
  'MARBETE',
  'VEHICLE REGISTRATION',
]
const ATH_PATTERNS = ['ATH MOVIL', 'TRANF ATHM', 'ATHM']
const ATH_MERCHANT_HINTS = ['EXCELL', 'STARBUCKS', 'CAFETERIA', 'CAFE']

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
  return analyzeFinancialIdentity({ name }).identityType
}

export function analyzeFinancialIdentity(
  input: FinancialIdentitySignalInput
): FinancialIdentityAnalysis {
  const normalizedName = normalizeFinancialIdentityName(input.name)
  const merchantAlias = normalizeMerchantAlias(input.name)
  const institutionName = normalizeFinancialIdentityName(input.institutionName)
  const accountName = normalizeFinancialIdentityName(input.accountName)
  const accountType = normalizeFinancialIdentityName(input.accountType)
  const accountSubtype = normalizeFinancialIdentityName(input.accountSubtype)
  const paymentMethod = normalizeFinancialIdentityName(input.paymentMethod)
  const category = normalizeFinancialIdentityName(input.category)
  const accountSignal = [
    institutionName,
    accountName,
    accountType,
    accountSubtype,
    paymentMethod,
  ].filter(Boolean).join(' ')
  const reasons: string[] = []

  if (!normalizedName || normalizedName === 'UNKNOWN') {
    return {
      normalizedIdentity: normalizedName,
      identityType: 'unknown',
      confidence: 0.2,
      shouldReview: true,
      canonicalCategoryCode: null,
      reasons: ['No transaction name was available.'],
    }
  }

  if (institutionName) reasons.push(`Institution = ${institutionName}.`)
  if (accountType) reasons.push(`Account Type = ${accountType}.`)
  if (paymentMethod) reasons.push(`Payment Method = ${paymentMethod}.`)

  if (includesAny(normalizedName, BANK_FEE_PATTERNS)) {
    reasons.push('Merchant pattern = bank fee.')

    return {
      normalizedIdentity: normalizedName,
      identityType: 'bank_fee',
      confidence: 0.9,
      shouldReview: false,
      canonicalCategoryCode: 'finance_bank_fees',
      reasons,
    }
  }

  if (includesAny(normalizedName, GOVERNMENT_PATTERNS)) {
    reasons.push('Merchant pattern = government vehicle service.')

    return {
      normalizedIdentity: normalizedName,
      identityType: 'government',
      confidence: 0.85,
      shouldReview: false,
      canonicalCategoryCode: 'transportation_vehicle_registration',
      reasons,
    }
  }

  const hasCreditPaymentPattern = includesAny(
    normalizedName,
    CREDIT_PAYMENT_PATTERNS
  )
  const hasCreditAccountSignal = includesAny(
    accountSignal,
    CREDIT_ACCOUNT_PATTERNS
  )
  const hasClearCardPaymentPattern = includesAny(
    normalizedName,
    CLEAR_CARD_PAYMENT_PATTERNS
  )

  if (
    hasCreditPaymentPattern &&
    (hasCreditAccountSignal || hasClearCardPaymentPattern)
  ) {
    reasons.push('Merchant pattern = credit card payment.')

    return {
      normalizedIdentity: normalizedName,
      identityType: 'credit_card_payment',
      confidence: hasCreditAccountSignal ? 0.95 : 0.88,
      shouldReview: false,
      canonicalCategoryCode: 'transfers_card_payment',
      reasons,
    }
  }

  if (includesAny(normalizedName, ATH_PATTERNS)) {
    reasons.push('Payment channel = ATH.')

    if (includesAny(normalizedName, PERSON_PATTERNS)) {
      reasons.push('ATH counterparty matches a known person.')

      return {
        normalizedIdentity: merchantAlias || normalizedName,
        identityType: 'person_transfer',
        confidence: 0.86,
        shouldReview: false,
        canonicalCategoryCode: 'transfers_internal',
        reasons,
      }
    }

    if (includesAny(normalizedName, ATH_MERCHANT_HINTS)) {
      reasons.push('ATH counterparty looks like a merchant.')

      return {
        normalizedIdentity: merchantAlias || normalizedName,
        identityType: 'merchant',
        confidence: 0.66,
        shouldReview: false,
        canonicalCategoryCode: null,
        reasons,
      }
    }

    return {
      normalizedIdentity: merchantAlias || normalizedName,
      identityType: 'transfer',
      confidence: 0.62,
      shouldReview: true,
      canonicalCategoryCode: null,
      reasons,
    }
  }

  if (includesAny(normalizedName, ['TRANSFER', 'TRANSFERENCIA'])) {
    return {
      normalizedIdentity: normalizedName,
      identityType: includesAny(normalizedName, PERSON_PATTERNS)
        ? 'person_transfer'
        : 'transfer',
      confidence: 0.72,
      shouldReview: false,
      canonicalCategoryCode: includesAny(normalizedName, PERSON_PATTERNS)
        ? 'transfers_internal'
        : null,
      reasons: [...reasons, 'Merchant pattern = transfer.'],
    }
  }

  if (includesAny(normalizedName, PERSON_PATTERNS)) {
    return {
      normalizedIdentity: normalizedName,
      identityType: 'person',
      confidence: 0.7,
      shouldReview: false,
      canonicalCategoryCode: null,
      reasons: [...reasons, 'Merchant pattern = known person.'],
    }
  }

  if (
    includesAny(normalizedName, ['CHECK DEPOSIT', 'PAYROLL', 'NOMINA'])
  ) {
    return {
      normalizedIdentity: normalizedName,
      identityType: 'income',
      confidence: 0.8,
      shouldReview: false,
      canonicalCategoryCode: 'income',
      reasons: [...reasons, 'Merchant pattern = income.'],
    }
  }

  if (includesAny(normalizedName, ['REFUND', 'REVERSAL'])) {
    return {
      normalizedIdentity: normalizedName,
      identityType: 'refund',
      confidence: 0.76,
      shouldReview: false,
      canonicalCategoryCode: null,
      reasons: [...reasons, 'Merchant pattern = refund.'],
    }
  }

  if (includesAny(normalizedName, ['IOD INTEREST'])) {
    return {
      normalizedIdentity: normalizedName,
      identityType: 'interest',
      confidence: 0.82,
      shouldReview: false,
      canonicalCategoryCode: 'finance_interest',
      reasons: [...reasons, 'Merchant pattern = interest.'],
    }
  }

  if (includesAny(normalizedName, ['LUMA'])) {
    return {
      normalizedIdentity: normalizedName,
      identityType: 'utility',
      confidence: 0.75,
      shouldReview: false,
      canonicalCategoryCode: 'utilities_electricity',
      reasons: [...reasons, 'Merchant pattern = utility.'],
    }
  }

  if (includesAny(normalizedName, ['COOP LARES'])) {
    return {
      normalizedIdentity: normalizedName,
      identityType: 'loan',
      confidence: 0.75,
      shouldReview: false,
      canonicalCategoryCode: null,
      reasons: [...reasons, 'Merchant pattern = loan.'],
    }
  }

  if (
    includesAny(normalizedName, ['OPENAI', 'APPLE', 'NINTENDO'])
  ) {
    return {
      normalizedIdentity: normalizedName,
      identityType: 'subscription',
      confidence: 0.72,
      shouldReview: false,
      canonicalCategoryCode: null,
      reasons: [...reasons, 'Merchant pattern = subscription.'],
    }
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
    return {
      normalizedIdentity: normalizedName,
      identityType: 'institution',
      confidence: 0.68,
      shouldReview: false,
      canonicalCategoryCode: null,
      reasons: [...reasons, 'Merchant pattern = institution.'],
    }
  }

  if (
    includesAny(normalizedName, [
      'WALGREENS',
      'AMAZON',
      'WALMART',
      'COSTCO',
    ])
  ) {
    return {
      normalizedIdentity: normalizedName,
      identityType: 'merchant',
      confidence: 0.65,
      shouldReview: false,
      canonicalCategoryCode: null,
      reasons: [...reasons, 'Merchant pattern = merchant.'],
    }
  }

  if (category) reasons.push(`Existing Category = ${category}.`)

  return {
    normalizedIdentity: normalizedName,
    identityType: 'unknown',
    confidence: 0.2,
    shouldReview: true,
    canonicalCategoryCode: null,
    reasons: reasons.length > 0 ? reasons : ['No strong identity signal.'],
  }
}

export function isFinancialEvent(identityType: FinancialIdentityType) {
  return [
    'credit_card_payment',
    'bank_fee',
    'government',
    'person_transfer',
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
    const normalizedIdentity =
      normalizeMerchantAlias(observation.name) ||
      normalizeFinancialIdentityName(observation.name)
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
