import {
  getLedgerSummary,
  type LedgerDuplicateCandidate,
  type LedgerSummaryTransaction,
} from './ledger-summary'
import {
  getCategoryByCode,
  type CanonicalCategory,
} from './categories'
import {
  buildMerchantKnowledge,
  normalizeMerchantName,
  type MerchantKnowledge,
  type MerchantObservation,
} from './merchant-knowledge'
import type { FinancialIdentityType } from './financial-identity'
import type { FinancialSupabaseClient } from './types'
import {
  buildReconciliationMatches,
  type ReconciliationMatch,
  type ReconciliationPaymentInstance,
  type ReconciliationTransaction,
} from './reconciliation'
import { classifyFinancialIdentity } from './financial-identity'

export type ReviewQueueClassification =
  | 'readyToConfirm'
  | 'needsCategory'
  | 'possibleDuplicate'
  | 'athReview'
  | 'paymentConfirmation'
  | 'needsManualReview'

export type ReviewQueueCandidate = {
  id: string
  sourceTable: LedgerSummaryTransaction['sourceTable']
  transaction: LedgerSummaryTransaction
  classification: ReviewQueueClassification
  priority: number
  merchant: string
  canonicalCategory: CanonicalCategory | null
  suggestedCategory: string | null
  merchantKnowledge: MerchantKnowledge | null
  financialIdentity: {
    normalizedIdentity: string
    identityType: FinancialIdentityType
    confidence: number
    shouldReview: boolean
  }
  confidence: number
  paymentLifecycleContext: {
    status: string | null
    paymentName: string | null
    paymentAmount: number | null
    recommendedActionText: string | null
  } | null
  reconciliationContext: {
    match: ReconciliationMatch
  } | null
  duplicateContext: LedgerDuplicateCandidate | null
  reasons: string[]
}

export type ReviewQueueStatistics = {
  totalCandidates: number
  autoConfirmable: number
  manualReviewCount: number
  duplicateCount: number
  athCount: number
  paymentMatches: number
}

export type ReviewQueue = {
  candidates: ReviewQueueCandidate[]
  readyToConfirm: ReviewQueueCandidate[]
  needsCategory: ReviewQueueCandidate[]
  possibleDuplicate: ReviewQueueCandidate[]
  athReview: ReviewQueueCandidate[]
  paymentConfirmation: ReviewQueueCandidate[]
  needsManualReview: ReviewQueueCandidate[]
  statistics: ReviewQueueStatistics
  source: {
    ledgerSummary: Awaited<ReturnType<typeof getLedgerSummary>>
    reconciliationMatches: ReconciliationMatch[]
    payments: ReconciliationPaymentInstance[]
  }
}

type PaymentInstanceRow = {
  id: string
  name: string | null
  amount: number | string | null
  status: string | null
  effective_due_date: string | null
  updated_at: string | null
  notes: string | null
  scheduled_payment_id: string | null
}

function normalizeLegacyCategory(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function canonicalCategoryCode(legacyCategory: string | null) {
  const category = normalizeLegacyCategory(legacyCategory)

  if (!category || category === 'revisar') return null
  if (category === 'comida fuera' || category === 'fast food') {
    return 'food_restaurants'
  }
  if (category === 'cafeteria') return 'food_work_cafeteria'
  if (category === 'gasolina') return 'transportation_gas'
  if (category === 'farmacia') return 'health_pharmacy'
  if (category === 'pago de tarjeta') return 'transfers_card_payment'
  if (category === 'transferencia') return 'transfers_internal'
  if (category === 'ingreso') return 'income'

  return null
}

function transactionMerchant(transaction: LedgerSummaryTransaction) {
  return transaction.description || 'Unknown merchant'
}

function transactionDate(transaction: LedgerSummaryTransaction) {
  return transaction.date || new Date().toISOString().slice(0, 10)
}

function merchantObservation(
  transaction: LedgerSummaryTransaction
): MerchantObservation {
  return {
    merchantName: transactionMerchant(transaction),
    amount: transaction.amount,
    date: transactionDate(transaction),
    canonicalCategoryCode: canonicalCategoryCode(transaction.category),
  }
}

function merchantKnowledgeByName(transactions: LedgerSummaryTransaction[]) {
  const groups = new Map<string, MerchantObservation[]>()

  transactions.forEach((transaction) => {
    const observation = merchantObservation(transaction)
    const normalizedName = normalizeMerchantName(observation.merchantName)
    if (!normalizedName) return

    const group = groups.get(normalizedName) || []
    group.push(observation)
    groups.set(normalizedName, group)
  })

  return new Map(
    [...groups.entries()].map(([normalizedName, observations]) => [
      normalizedName,
      buildMerchantKnowledge(observations),
    ])
  )
}

function paymentFromRow(row: PaymentInstanceRow): ReconciliationPaymentInstance {
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount || 0),
    status: row.status,
    effective_due_date: row.effective_due_date,
    updated_at: row.updated_at,
    notes: row.notes,
    scheduled_payment_id: row.scheduled_payment_id,
  }
}

function reconciliationTransaction(
  transaction: LedgerSummaryTransaction
): ReconciliationTransaction | null {
  const name = transaction.description || transaction.category

  if (!name || !transaction.date) return null

  return {
    source: transaction.sourceTable,
    id: transaction.id,
    name,
    amount: transaction.amount,
    date: transaction.date,
  }
}

async function getOpenPayments(supabase: FinancialSupabaseClient) {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const { data, error } = await supabase
    .from('payment_instances')
    .select(
      'id, name, amount, status, effective_due_date, updated_at, notes, scheduled_payment_id'
    )
    .eq('payment_month', month)
    .eq('payment_year', year)
    .in('status', ['pending', 'initiated'])
    .order('effective_due_date', { ascending: true })

  if (error) throw error

  return ((data || []) as PaymentInstanceRow[]).map(paymentFromRow)
}

function classifyCandidate({
  transaction,
  duplicateContext,
  reconciliationContext,
  canonicalCategory,
  merchantKnowledge,
}: {
  transaction: LedgerSummaryTransaction
  duplicateContext: LedgerDuplicateCandidate | null
  reconciliationContext: ReconciliationMatch | null
  canonicalCategory: CanonicalCategory | null
  merchantKnowledge: MerchantKnowledge | null
}): ReviewQueueClassification {
  const category = normalizeLegacyCategory(transaction.category)
  const isAth = Boolean(
    normalizeMerchantName(transaction.description).match(/\bATH\b|\bATHM\b|ATH MOVIL/)
  )

  if (duplicateContext) return 'possibleDuplicate'
  if (isAth) return 'athReview'
  if (
    reconciliationContext &&
    ['high', 'likely'].includes(reconciliationContext.confidenceLevel)
  ) {
    return 'paymentConfirmation'
  }
  if (!category || category === 'revisar' || !canonicalCategory) {
    return 'needsCategory'
  }
  if (merchantKnowledge?.shouldAskAgain) return 'needsManualReview'

  return 'readyToConfirm'
}

function confidenceForCandidate({
  classification,
  canonicalCategory,
  merchantKnowledge,
  identityConfidence,
  duplicateContext,
  reconciliationContext,
}: {
  classification: ReviewQueueClassification
  canonicalCategory: CanonicalCategory | null
  merchantKnowledge: MerchantKnowledge | null
  identityConfidence: number
  duplicateContext: LedgerDuplicateCandidate | null
  reconciliationContext: ReconciliationMatch | null
}) {
  if (duplicateContext) {
    return Number((duplicateContext.bestDuplicateMatch.confidence / 100).toFixed(2))
  }

  if (reconciliationContext) {
    return Number((reconciliationContext.confidence / 100).toFixed(2))
  }

  let confidence = 0.25

  if (canonicalCategory) confidence += 0.25
  if (merchantKnowledge) confidence += merchantKnowledge.confidence * 0.3
  confidence += identityConfidence * 0.2

  if (classification === 'athReview') confidence = Math.min(confidence, 0.45)
  if (classification === 'needsCategory') confidence = Math.min(confidence, 0.55)

  return Math.min(Number(confidence.toFixed(2)), 0.95)
}

function priorityForCandidate(
  classification: ReviewQueueClassification,
  confidence: number
) {
  const basePriority: Record<ReviewQueueClassification, number> = {
    paymentConfirmation: 100,
    possibleDuplicate: 90,
    athReview: 80,
    needsCategory: 70,
    needsManualReview: 60,
    readyToConfirm: 40,
  }

  return basePriority[classification] + Math.round(confidence * 10)
}

function reasonsForCandidate({
  classification,
  canonicalCategory,
  merchantKnowledge,
  duplicateContext,
  reconciliationContext,
}: {
  classification: ReviewQueueClassification
  canonicalCategory: CanonicalCategory | null
  merchantKnowledge: MerchantKnowledge | null
  duplicateContext: LedgerDuplicateCandidate | null
  reconciliationContext: ReconciliationMatch | null
}) {
  const reasons: string[] = [`Classified as ${classification}.`]

  if (canonicalCategory) {
    reasons.push(`Mapped to canonical category ${canonicalCategory.code}.`)
  } else {
    reasons.push('No canonical category is available yet.')
  }

  if (merchantKnowledge) {
    reasons.push(
      `Merchant confidence is ${Math.round(merchantKnowledge.confidence * 100)}%.`
    )
  }

  if (duplicateContext) {
    reasons.push(
      `Best duplicate match confidence is ${duplicateContext.bestDuplicateMatch.confidence}%.`
    )
  }

  if (reconciliationContext) {
    reasons.push(
      `Payment reconciliation confidence is ${reconciliationContext.confidence}%.`
    )
  }

  return reasons
}

function bucketCandidates(candidates: ReviewQueueCandidate[]) {
  return {
    readyToConfirm: candidates.filter(
      (candidate) => candidate.classification === 'readyToConfirm'
    ),
    needsCategory: candidates.filter(
      (candidate) => candidate.classification === 'needsCategory'
    ),
    possibleDuplicate: candidates.filter(
      (candidate) => candidate.classification === 'possibleDuplicate'
    ),
    athReview: candidates.filter(
      (candidate) => candidate.classification === 'athReview'
    ),
    paymentConfirmation: candidates.filter(
      (candidate) => candidate.classification === 'paymentConfirmation'
    ),
    needsManualReview: candidates.filter(
      (candidate) => candidate.classification === 'needsManualReview'
    ),
  }
}

function stableCandidateKey(candidate: ReviewQueueCandidate) {
  return [
    candidate.sourceTable,
    candidate.transaction.plaidTransactionId || '',
    candidate.transaction.id,
  ].join(':')
}

function compareCandidates(
  left: ReviewQueueCandidate,
  right: ReviewQueueCandidate
) {
  return (
    right.priority - left.priority ||
    String(right.transaction.date).localeCompare(String(left.transaction.date)) ||
    stableCandidateKey(left).localeCompare(stableCandidateKey(right))
  )
}

export async function getReviewQueue(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<ReviewQueue> {
  const [ledgerSummary, payments] = await Promise.all([
    getLedgerSummary(supabase, userId),
    getOpenPayments(supabase),
  ])
  const knowledgeByMerchant = merchantKnowledgeByName([
    ...ledgerSummary.confirmedLedgerEntries,
    ...ledgerSummary.importedSourceRows,
    ...ledgerSummary.importCandidates,
  ])
  const duplicateByImportId = new Map(
    ledgerSummary.duplicateCandidates.map((candidate) => [
      candidate.importCandidate.id,
      candidate,
    ])
  )
  const transactions = ledgerSummary.importCandidates
    .map(reconciliationTransaction)
    .filter(
      (transaction): transaction is ReconciliationTransaction =>
        transaction !== null
    )
  const reconciliation = buildReconciliationMatches({
    transactions,
    payments,
  })
  const reconciliationByTransactionId = new Map(
    reconciliation.allMatches
      .filter((match) => match.confidence >= 50)
      .map((match) => [match.transactionId, match])
  )

  const candidates = ledgerSummary.importCandidates
    .map((transaction) => {
      const merchant = transactionMerchant(transaction)
      const normalizedMerchant = normalizeMerchantName(merchant)
      const merchantKnowledge =
        knowledgeByMerchant.get(normalizedMerchant) || null
      const categoryCode =
        canonicalCategoryCode(transaction.category) ||
        merchantKnowledge?.canonicalCategoryCode ||
        null
      const canonicalCategory = categoryCode
        ? getCategoryByCode(categoryCode)
        : null
      const identityType = classifyFinancialIdentity(merchant)
      const identityConfidence = identityType === 'unknown' ? 0.2 : 0.7
      const duplicateContext = duplicateByImportId.get(transaction.id) || null
      const reconciliationContext =
        reconciliationByTransactionId.get(transaction.id) || null
      const classification = classifyCandidate({
        transaction,
        duplicateContext,
        reconciliationContext,
        canonicalCategory,
        merchantKnowledge,
      })
      const confidence = confidenceForCandidate({
        classification,
        canonicalCategory,
        merchantKnowledge,
        identityConfidence,
        duplicateContext,
        reconciliationContext,
      })
      const paymentLifecycleContext = reconciliationContext
        ? {
            status: reconciliationContext.paymentStatus,
            paymentName: reconciliationContext.paymentName,
            paymentAmount: reconciliationContext.paymentAmount,
            recommendedActionText:
              reconciliationContext.recommendedActionText,
          }
        : null

      return {
        id: `${transaction.sourceTable}:${transaction.id}`,
        sourceTable: transaction.sourceTable,
        transaction,
        classification,
        priority: priorityForCandidate(classification, confidence),
        merchant: normalizedMerchant || merchant,
        canonicalCategory,
        suggestedCategory: transaction.category,
        merchantKnowledge,
        financialIdentity: {
          normalizedIdentity: normalizedMerchant || merchant,
          identityType,
          confidence: identityConfidence,
          shouldReview: identityType === 'unknown',
        },
        confidence,
        paymentLifecycleContext,
        reconciliationContext: reconciliationContext
          ? { match: reconciliationContext }
          : null,
        duplicateContext,
        reasons: reasonsForCandidate({
          classification,
          canonicalCategory,
          merchantKnowledge,
          duplicateContext,
          reconciliationContext,
        }),
      }
    })
    .sort(compareCandidates)

  const buckets = bucketCandidates(candidates)

  return {
    candidates,
    ...buckets,
    statistics: {
      totalCandidates: candidates.length,
      autoConfirmable: buckets.readyToConfirm.length,
      manualReviewCount:
        buckets.needsCategory.length +
        buckets.athReview.length +
        buckets.needsManualReview.length,
      duplicateCount: buckets.possibleDuplicate.length,
      athCount: buckets.athReview.length,
      paymentMatches: buckets.paymentConfirmation.length,
    },
    source: {
      ledgerSummary,
      reconciliationMatches: reconciliation.allMatches,
      payments,
    },
  }
}
