import { getCategoryByCode } from './categories'
import type { FinancialIdentityType } from './financial-identity'
import { normalizeMerchantAlias } from './merchant-normalization'

export type MerchantLearningStateName =
  | 'new'
  | 'learning'
  | 'stable'
  | 'trusted'
  | 'auto_confirm'
  | 'needs_review'

export type MerchantLearningBadge = 'learned' | 'learning' | 'unknown'
export type MerchantObservationSource = 'plaid_imports' | 'quick_entries'

export const MERCHANT_LEARNING_CONFIG = {
  autoConfirmConfidenceThreshold: 0.85,
  stableConfidenceThreshold: 0.75,
  trustedConfidenceThreshold: 0.9,
  minimumConfirmedForStable: 3,
  minimumConfirmedForAutoConfirm: 3,
  categoryChangeConfirmationsRequired: 2,
  driftPenalty: 0.3,
} as const

export interface MerchantObservation {
  merchantName: string | null
  amount: number
  date: string
  canonicalCategoryCode: string | null
  source?: MerchantObservationSource
  isConfirmed?: boolean
  financialIdentityType?: FinancialIdentityType | null
}

export interface MerchantCategoryCount {
  canonicalCategoryCode: string
  count: number
  confirmedCount: number
  firstSeen: string | null
  lastSeen: string | null
}

export interface MerchantStatistics {
  timesSeen: number
  timesConfirmed: number
  timesChanged: number
  averageAmount: number
  minimumAmount: number
  maximumAmount: number
  firstSeen: string | null
  lastSeen: string | null
  categoryConsensus: number
  driftDetected: boolean
  latestCategoryCode: string | null
  categoryCounts: MerchantCategoryCount[]
}

export interface MerchantConfidenceReason {
  code: string
  description: string
  impact: number
}

export interface MerchantLearningState {
  state: MerchantLearningStateName
  isStable: boolean
  isTrusted: boolean
  isAutoConfirmable: boolean
  shouldAskAgain: boolean
  badge: MerchantLearningBadge
}

export interface MerchantKnowledge {
  normalizedMerchantName: string
  canonicalCategoryCode: string | null
  timesSeen: number
  timesConfirmed: number
  timesChanged: number
  averageAmount: number
  minimumAmount: number
  maximumAmount: number
  firstSeen: string | null
  lastSeen: string | null
  categoryConsensus: number
  driftDetected: boolean
  latestCategoryCode: string | null
  categoryCounts: MerchantCategoryCount[]
  confidence: number
  currentConfidence: number
  confidenceReasons: MerchantConfidenceReason[]
  learningBlockers: string[]
  learningStatus: MerchantLearningStateName
  learningBadge: MerchantLearningBadge
  isStable: boolean
  isTrusted: boolean
  isAutoConfirmable: boolean
  shouldAskAgain: boolean
}

export function normalizeMerchantName(merchantName: string | null | undefined) {
  return normalizeMerchantAlias(merchantName)
}

function isConfirmedObservation(observation: MerchantObservation) {
  return observation.isConfirmed ?? observation.source === 'quick_entries'
}

function categoryCountsFromObservations(observations: MerchantObservation[]) {
  const counts = new Map<string, MerchantCategoryCount>()

  observations.forEach((observation) => {
    const canonicalCategoryCode = observation.canonicalCategoryCode
    if (!canonicalCategoryCode) return

    const existing = counts.get(canonicalCategoryCode) || {
      canonicalCategoryCode,
      count: 0,
      confirmedCount: 0,
      firstSeen: null,
      lastSeen: null,
    }
    const dates = [existing.firstSeen, existing.lastSeen, observation.date]
      .filter((date): date is string => Boolean(date))
      .sort()

    counts.set(canonicalCategoryCode, {
      ...existing,
      count: existing.count + 1,
      confirmedCount:
        existing.confirmedCount + (isConfirmedObservation(observation) ? 1 : 0),
      firstSeen: dates[0] || null,
      lastSeen: dates.at(-1) || null,
    })
  })

  return [...counts.values()].sort(
    (a, b) =>
      b.confirmedCount - a.confirmedCount ||
      b.count - a.count ||
      a.canonicalCategoryCode.localeCompare(b.canonicalCategoryCode)
  )
}

function mostCommonConfirmedCategory(observations: MerchantObservation[]) {
  return (
    categoryCountsFromObservations(
      observations.filter(isConfirmedObservation)
    )[0]?.canonicalCategoryCode || null
  )
}

function statisticsFromObservations(
  observations: MerchantObservation[],
  canonicalCategoryCode: string | null
): MerchantStatistics {
  const amounts = observations.map((observation) =>
    Math.abs(Number(observation.amount || 0))
  )
  const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0)
  const sortedDates = observations
    .map((observation) => observation.date)
    .filter(Boolean)
    .sort()
  const categoryCounts = categoryCountsFromObservations(observations)
  const confirmedObservations = observations.filter(isConfirmedObservation)
  const categorizedConfirmedObservations = confirmedObservations.filter(
    (observation) => observation.canonicalCategoryCode
  )
  const primaryCategoryCount =
    categoryCounts.find(
      (category) => category.canonicalCategoryCode === canonicalCategoryCode
    )?.confirmedCount || 0
  const timesChanged = Math.max(
    0,
    categorizedConfirmedObservations.length - primaryCategoryCount
  )
  const latestCategoryCode =
    [...categorizedConfirmedObservations]
      .filter((observation) => observation.canonicalCategoryCode)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
      ?.canonicalCategoryCode || null
  const categoryConsensus =
    categorizedConfirmedObservations.length > 0
      ? primaryCategoryCount / categorizedConfirmedObservations.length
      : 0
  const driftDetected = Boolean(
    canonicalCategoryCode &&
      latestCategoryCode &&
      latestCategoryCode !== canonicalCategoryCode &&
      primaryCategoryCount >=
        MERCHANT_LEARNING_CONFIG.minimumConfirmedForStable
  )

  return {
    timesSeen: observations.length,
    timesConfirmed: confirmedObservations.length,
    timesChanged,
    averageAmount: amounts.length > 0 ? totalAmount / amounts.length : 0,
    minimumAmount: amounts.length > 0 ? Math.min(...amounts) : 0,
    maximumAmount: amounts.length > 0 ? Math.max(...amounts) : 0,
    firstSeen: sortedDates[0] || null,
    lastSeen: sortedDates.at(-1) || null,
    categoryConsensus,
    driftDetected,
    latestCategoryCode,
    categoryCounts,
  }
}

export function calculateMerchantConfidence({
  statistics,
  canonicalCategoryCode,
}: {
  statistics: MerchantStatistics
  canonicalCategoryCode: string | null
}) {
  const confidenceReasons: MerchantConfidenceReason[] = []
  let confidence = 0.15

  if (statistics.timesConfirmed >= 10) {
    confidence += 0.45
    confidenceReasons.push({
      code: 'confirmed_many_times',
      description: 'Merchant has at least ten confirmed ledger observations.',
      impact: 0.45,
    })
  } else if (statistics.timesConfirmed >= 5) {
    confidence += 0.35
    confidenceReasons.push({
      code: 'confirmed_often',
      description: 'Merchant has at least five confirmed ledger observations.',
      impact: 0.35,
    })
  } else if (statistics.timesConfirmed >= 3) {
    confidence += 0.25
    confidenceReasons.push({
      code: 'confirmed_multiple_times',
      description: 'Merchant has enough confirmed observations to learn.',
      impact: 0.25,
    })
  } else if (statistics.timesConfirmed >= 1) {
    confidence += 0.12
    confidenceReasons.push({
      code: 'confirmed_once',
      description: 'Merchant has one confirmed ledger observation.',
      impact: 0.12,
    })
  } else if (statistics.timesSeen >= 1) {
    confidence += 0.05
    confidenceReasons.push({
      code: 'seen_not_confirmed',
      description:
        'Merchant has appeared but not enough confirmed ledger history.',
      impact: 0.05,
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

  if (statistics.categoryConsensus >= 0.9 && statistics.timesConfirmed >= 3) {
    confidence += 0.2
    confidenceReasons.push({
      code: 'category_consensus_high',
      description: 'Confirmed observations strongly agree on the category.',
      impact: 0.2,
    })
  } else if (
    statistics.categoryConsensus >= 0.75 &&
    statistics.timesConfirmed >= 3
  ) {
    confidence += 0.12
    confidenceReasons.push({
      code: 'category_consensus_good',
      description: 'Most confirmed observations agree on the category.',
      impact: 0.12,
    })
  } else if (statistics.timesChanged > 0) {
    confidence -= 0.18
    confidenceReasons.push({
      code: 'category_consensus_low',
      description: 'Confirmed category history is inconsistent.',
      impact: -0.18,
    })
  }

  const amountSpread = statistics.maximumAmount - statistics.minimumAmount
  const amountSpreadRatio =
    statistics.averageAmount > 0 ? amountSpread / statistics.averageAmount : 0

  if (statistics.timesConfirmed >= 2 && amountSpreadRatio <= 0.5) {
    confidence += 0.1
    confidenceReasons.push({
      code: 'amount_pattern_stable',
      description: 'Observed amounts are relatively consistent.',
      impact: 0.1,
    })
  }

  if (statistics.timesChanged > 0) {
    const penalty = Math.min(0.24, statistics.timesChanged * 0.08)
    confidence -= penalty
    confidenceReasons.push({
      code: 'category_changed',
      description: 'Some confirmed observations use a different category.',
      impact: -penalty,
    })
  }

  if (statistics.driftDetected) {
    confidence -= MERCHANT_LEARNING_CONFIG.driftPenalty
    confidenceReasons.push({
      code: 'possible_drift',
      description:
        'The latest category conflicts with a previously learned category.',
      impact: -MERCHANT_LEARNING_CONFIG.driftPenalty,
    })
  }

  return {
    confidence: Math.max(0.05, Math.min(Number(confidence.toFixed(2)), 0.98)),
    confidenceReasons,
  }
}

export function isStableMerchant(knowledge: MerchantKnowledge) {
  return (
    knowledge.confidence >= MERCHANT_LEARNING_CONFIG.stableConfidenceThreshold &&
    knowledge.timesConfirmed >=
      MERCHANT_LEARNING_CONFIG.minimumConfirmedForStable &&
    !knowledge.driftDetected
  )
}

export function isTrustedMerchant(knowledge: MerchantKnowledge) {
  return (
    knowledge.confidence >=
      MERCHANT_LEARNING_CONFIG.trustedConfidenceThreshold &&
    knowledge.timesConfirmed >= 5 &&
    knowledge.categoryConsensus >= 0.9 &&
    !knowledge.driftDetected
  )
}

export function isAutoConfirmableMerchant(knowledge: MerchantKnowledge) {
  return (
    Boolean(knowledge.canonicalCategoryCode) &&
    knowledge.confidence >=
      MERCHANT_LEARNING_CONFIG.autoConfirmConfidenceThreshold &&
    knowledge.timesConfirmed >=
      MERCHANT_LEARNING_CONFIG.minimumConfirmedForAutoConfirm &&
    !knowledge.driftDetected &&
    knowledge.timesChanged <
      MERCHANT_LEARNING_CONFIG.categoryChangeConfirmationsRequired
  )
}

export function needsReview(knowledge: MerchantKnowledge) {
  return (
    !knowledge.canonicalCategoryCode ||
    knowledge.driftDetected ||
    knowledge.confidence < 0.65
  )
}

export function getMerchantLearningState(
  knowledge: MerchantKnowledge
): MerchantLearningState {
  if (needsReview(knowledge)) {
    return {
      state: 'needs_review',
      isStable: false,
      isTrusted: false,
      isAutoConfirmable: false,
      shouldAskAgain: true,
      badge: knowledge.canonicalCategoryCode ? 'learning' : 'unknown',
    }
  }

  if (isAutoConfirmableMerchant(knowledge)) {
    return {
      state: 'auto_confirm',
      isStable: true,
      isTrusted: true,
      isAutoConfirmable: true,
      shouldAskAgain: false,
      badge: 'learned',
    }
  }

  if (isTrustedMerchant(knowledge)) {
    return {
      state: 'trusted',
      isStable: true,
      isTrusted: true,
      isAutoConfirmable: false,
      shouldAskAgain: false,
      badge: 'learned',
    }
  }

  if (isStableMerchant(knowledge)) {
    return {
      state: 'stable',
      isStable: true,
      isTrusted: false,
      isAutoConfirmable: false,
      shouldAskAgain: false,
      badge: 'learned',
    }
  }

  return {
    state: knowledge.timesSeen <= 1 ? 'new' : 'learning',
    isStable: false,
    isTrusted: false,
    isAutoConfirmable: false,
    shouldAskAgain: false,
    badge: knowledge.canonicalCategoryCode ? 'learning' : 'unknown',
  }
}

export function explainMerchantLearningBlockers(knowledge: MerchantKnowledge) {
  const blockers: string[] = []

  if (knowledge.timesSeen === 1 && knowledge.timesConfirmed === 0) {
    blockers.push('First transaction seen. Needs one confirmation before learning.')
  } else if (knowledge.timesSeen > 1 && knowledge.timesConfirmed === 0) {
    blockers.push(
      `Seen ${knowledge.timesSeen} times but never confirmed in the ledger.`
    )
  }

  if (knowledge.timesConfirmed > 0 && !knowledge.canonicalCategoryCode) {
    blockers.push(
      'Confirmed ledger rows exist, but none map to a canonical category.'
    )
  }

  if (
    knowledge.canonicalCategoryCode &&
    knowledge.timesConfirmed <
      MERCHANT_LEARNING_CONFIG.minimumConfirmedForAutoConfirm
  ) {
    blockers.push(
      `Needs ${
        MERCHANT_LEARNING_CONFIG.minimumConfirmedForAutoConfirm -
        knowledge.timesConfirmed
      } more confirmed ledger observation(s) before auto-confirm.`
    )
  }

  if (
    knowledge.canonicalCategoryCode &&
    knowledge.confidence < MERCHANT_LEARNING_CONFIG.autoConfirmConfidenceThreshold
  ) {
    blockers.push(
      `Confidence must reach ${Math.round(
        MERCHANT_LEARNING_CONFIG.autoConfirmConfidenceThreshold * 100
      )}% before auto-confirm.`
    )
  }

  if (knowledge.timesChanged > 0) {
    blockers.push('Confirmed category history changed; keep asking until stable.')
  }

  if (knowledge.driftDetected) {
    blockers.push('Possible category drift detected from confirmed ledger history.')
  }

  if (blockers.length === 0 && knowledge.isAutoConfirmable) {
    blockers.push('Auto-confirm eligible from confirmed ledger history.')
  }

  return blockers
}

export function buildMerchantKnowledge(
  observations: MerchantObservation[]
): MerchantKnowledge {
  const normalizedMerchantName = normalizeMerchantName(
    observations[0]?.merchantName
  )
  const canonicalCategoryCode = mostCommonConfirmedCategory(observations)
  const statistics = statisticsFromObservations(
    observations,
    canonicalCategoryCode
  )
  const { confidence, confidenceReasons } = calculateMerchantConfidence({
    statistics,
    canonicalCategoryCode,
  })
  const draftKnowledge: MerchantKnowledge = {
    normalizedMerchantName,
    canonicalCategoryCode,
    timesSeen: statistics.timesSeen,
    timesConfirmed: statistics.timesConfirmed,
    timesChanged: statistics.timesChanged,
    averageAmount: statistics.averageAmount,
    minimumAmount: statistics.minimumAmount,
    maximumAmount: statistics.maximumAmount,
    firstSeen: statistics.firstSeen,
    lastSeen: statistics.lastSeen,
    categoryConsensus: statistics.categoryConsensus,
    driftDetected: statistics.driftDetected,
    latestCategoryCode: statistics.latestCategoryCode,
    categoryCounts: statistics.categoryCounts,
    confidence,
    currentConfidence: confidence,
    confidenceReasons,
    learningBlockers: [],
    learningStatus: 'new',
    learningBadge: 'unknown',
    isStable: false,
    isTrusted: false,
    isAutoConfirmable: false,
    shouldAskAgain: false,
  }
  const learningState = getMerchantLearningState(draftKnowledge)

  return {
    ...draftKnowledge,
    learningBlockers: explainMerchantLearningBlockers({
      ...draftKnowledge,
      learningStatus: learningState.state,
      learningBadge: learningState.badge,
      isStable: learningState.isStable,
      isTrusted: learningState.isTrusted,
      isAutoConfirmable: learningState.isAutoConfirmable,
      shouldAskAgain: learningState.shouldAskAgain,
    }),
    learningStatus: learningState.state,
    learningBadge: learningState.badge,
    isStable: learningState.isStable,
    isTrusted: learningState.isTrusted,
    isAutoConfirmable: learningState.isAutoConfirmable,
    shouldAskAgain: learningState.shouldAskAgain,
  }
}
