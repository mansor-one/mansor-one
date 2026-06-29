import { getCategoryByCode } from './categories'

export type MerchantLearningStateName =
  | 'new'
  | 'learning'
  | 'stable'
  | 'needs_review'

export interface MerchantObservation {
  merchantName: string | null
  amount: number
  date: string
  canonicalCategoryCode: string | null
}

export interface MerchantStatistics {
  timesSeen: number
  averageAmount: number
  minimumAmount: number
  maximumAmount: number
  lastSeen: string | null
}

export interface MerchantConfidenceReason {
  code: string
  description: string
  impact: number
}

export interface MerchantLearningState {
  state: MerchantLearningStateName
  isStable: boolean
  shouldAskAgain: boolean
}

export interface MerchantKnowledge {
  normalizedMerchantName: string
  canonicalCategoryCode: string | null
  timesSeen: number
  averageAmount: number
  minimumAmount: number
  maximumAmount: number
  lastSeen: string | null
  confidence: number
  confidenceReasons: MerchantConfidenceReason[]
  isStable: boolean
  shouldAskAgain: boolean
}

export function normalizeMerchantName(merchantName: string | null | undefined) {
  const normalized = String(merchantName || '')
    .toUpperCase()
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

  if (
    normalized === 'CHURCHS' ||
    normalized === "CHURCH'S" ||
    normalized === 'CHURCH CHICKEN'
  ) {
    return "CHURCH'S"
  }

  if (normalized.startsWith('STARBUCKS')) {
    return 'STARBUCKS'
  }

  return normalized
}

function statisticsFromObservations(
  observations: MerchantObservation[]
): MerchantStatistics {
  const amounts = observations.map((observation) =>
    Math.abs(Number(observation.amount || 0))
  )
  const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0)
  const sortedDates = observations
    .map((observation) => observation.date)
    .filter(Boolean)
    .sort()

  return {
    timesSeen: observations.length,
    averageAmount: amounts.length > 0 ? totalAmount / amounts.length : 0,
    minimumAmount: amounts.length > 0 ? Math.min(...amounts) : 0,
    maximumAmount: amounts.length > 0 ? Math.max(...amounts) : 0,
    lastSeen: sortedDates.at(-1) || null,
  }
}

function mostCommonCategory(observations: MerchantObservation[]) {
  const counts = new Map<string, number>()

  observations.forEach((observation) => {
    if (!observation.canonicalCategoryCode) return
    counts.set(
      observation.canonicalCategoryCode,
      (counts.get(observation.canonicalCategoryCode) || 0) + 1
    )
  })

  return (
    [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null
  )
}

export function calculateMerchantConfidence(
  statistics: MerchantStatistics,
  canonicalCategoryCode: string | null
) {
  const confidenceReasons: MerchantConfidenceReason[] = []
  let confidence = 0.2

  if (statistics.timesSeen >= 5) {
    confidence += 0.45
    confidenceReasons.push({
      code: 'seen_often',
      description: 'Merchant has appeared at least five times.',
      impact: 0.45,
    })
  } else if (statistics.timesSeen >= 3) {
    confidence += 0.3
    confidenceReasons.push({
      code: 'seen_multiple_times',
      description: 'Merchant has appeared multiple times.',
      impact: 0.3,
    })
  } else if (statistics.timesSeen >= 1) {
    confidence += 0.1
    confidenceReasons.push({
      code: 'seen_once',
      description: 'Merchant has at least one observation.',
      impact: 0.1,
    })
  }

  if (canonicalCategoryCode && getCategoryByCode(canonicalCategoryCode)) {
    confidence += 0.2
    confidenceReasons.push({
      code: 'canonical_category_known',
      description: 'Merchant is linked to a known canonical category.',
      impact: 0.2,
    })
  }

  const amountSpread = statistics.maximumAmount - statistics.minimumAmount
  const amountSpreadRatio =
    statistics.averageAmount > 0 ? amountSpread / statistics.averageAmount : 0

  if (statistics.timesSeen >= 2 && amountSpreadRatio <= 0.5) {
    confidence += 0.15
    confidenceReasons.push({
      code: 'amount_pattern_stable',
      description: 'Observed amounts are relatively consistent.',
      impact: 0.15,
    })
  }

  return {
    confidence: Math.min(Number(confidence.toFixed(2)), 0.95),
    confidenceReasons,
  }
}

export function isStableMerchant(knowledge: MerchantKnowledge) {
  return knowledge.confidence >= 0.75 && knowledge.timesSeen >= 3
}

export function needsReview(knowledge: MerchantKnowledge) {
  return !knowledge.canonicalCategoryCode || knowledge.confidence < 0.65
}

export function buildMerchantKnowledge(
  observations: MerchantObservation[]
): MerchantKnowledge {
  const normalizedMerchantName = normalizeMerchantName(
    observations[0]?.merchantName
  )
  const statistics = statisticsFromObservations(observations)
  const canonicalCategoryCode = mostCommonCategory(observations)
  const { confidence, confidenceReasons } = calculateMerchantConfidence(
    statistics,
    canonicalCategoryCode
  )
  const draftKnowledge = {
    normalizedMerchantName,
    canonicalCategoryCode,
    timesSeen: statistics.timesSeen,
    averageAmount: statistics.averageAmount,
    minimumAmount: statistics.minimumAmount,
    maximumAmount: statistics.maximumAmount,
    lastSeen: statistics.lastSeen,
    confidence,
    confidenceReasons,
    isStable: false,
    shouldAskAgain: false,
  }

  const isStable = isStableMerchant(draftKnowledge)
  const shouldAskAgain = needsReview(draftKnowledge)

  return {
    ...draftKnowledge,
    isStable,
    shouldAskAgain,
  }
}

export function getMerchantLearningState(
  knowledge: MerchantKnowledge
): MerchantLearningState {
  if (needsReview(knowledge)) {
    return {
      state: 'needs_review',
      isStable: false,
      shouldAskAgain: true,
    }
  }

  if (isStableMerchant(knowledge)) {
    return {
      state: 'stable',
      isStable: true,
      shouldAskAgain: false,
    }
  }

  return {
    state: knowledge.timesSeen <= 1 ? 'new' : 'learning',
    isStable: false,
    shouldAskAgain: false,
  }
}
