import { OPEN_PAYMENT_STATUSES, type PaymentStatus } from '../finance/paymentLifecycle'
import { classifyFinancialIdentity } from './financial-identity'

export type ReconciliationTransactionSource = 'plaid_imports' | 'quick_entries'

export type ReconciliationConfidenceLevel =
  | 'high'
  | 'likely'
  | 'possible'
  | 'low'

export type ReconciliationTransaction = {
  source: ReconciliationTransactionSource
  id: string
  name: string | null
  amount: number
  date: string | null
}

export type ReconciliationPaymentInstance = {
  id: string
  name: string | null
  amount: number
  status: PaymentStatus | string | null
  effective_due_date: string | null
  updated_at?: string | null
  notes?: string | null
  scheduled_payment_id?: string | null
}

export type ReconciliationMatch = {
  transactionSource: ReconciliationTransactionSource
  transactionId: string
  transactionName: string | null
  transactionAmount: number
  transactionDate: string | null
  paymentInstanceId: string
  paymentName: string | null
  paymentAmount: number
  paymentStatus: string | null
  confidence: number
  confidenceLevel: ReconciliationConfidenceLevel
  reasons: string[]
  recommendedActionText: string
}

export type ReconciliationResult = {
  highConfidenceMatches: ReconciliationMatch[]
  likelyMatches: ReconciliationMatch[]
  possibleMatches: ReconciliationMatch[]
  lowConfidenceMatches: ReconciliationMatch[]
  unmatchedInitiatedPayments: ReconciliationPaymentInstance[]
  allMatches: ReconciliationMatch[]
}

const DATE_WINDOW_DAYS = 10

const PAYMENT_ALIASES: Record<string, string[]> = {
  agua: ['AGUA', 'AAA', 'PRASA'],
  lares: ['LARES', 'COOP LARES'],
  luma: ['LUMA', 'LUZ', 'UTILITY', 'ELECTRICITY'],
  luz: ['LUMA', 'LUZ', 'UTILITY', 'ELECTRICITY'],
  synchrony: [
    'SYNCHRONY',
    'CREDIT CARD PAYMENT',
    'CR CARD PAYMENT',
    'EFT PMT',
    'CARDMEMBER',
    'U S BANK',
    'US BANK',
    'U.S. BANK',
    'POPULAR CR CARD PAYMENT',
  ],
}

function normalize(value: string | null | undefined) {
  return String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function dateOnly(value: string | null | undefined) {
  if (!value) return null
  return new Date(`${value.slice(0, 10)}T00:00:00`)
}

function daysBetween(left: Date, right: Date) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000
  return Math.round((left.getTime() - right.getTime()) / millisecondsPerDay)
}

function confidenceLevel(confidence: number): ReconciliationConfidenceLevel {
  if (confidence >= 90) return 'high'
  if (confidence >= 70) return 'likely'
  if (confidence >= 50) return 'possible'
  return 'low'
}

function amountReasons(
  transaction: ReconciliationTransaction,
  payment: ReconciliationPaymentInstance
) {
  const transactionAmount = Math.abs(Number(transaction.amount || 0))
  const paymentAmount = Math.abs(Number(payment.amount || 0))
  const difference = Math.abs(transactionAmount - paymentAmount)
  const percentDifference =
    paymentAmount > 0 ? difference / paymentAmount : Number.POSITIVE_INFINITY

  if (difference <= 0.009) {
    return { score: 45, reasons: ['Exact amount match.'] }
  }

  if (difference <= 1) {
    return { score: 30, reasons: ['Amount is within $1.'] }
  }

  if (percentDifference <= 0.05) {
    return { score: 20, reasons: ['Amount is within 5%.'] }
  }

  return { score: 0, reasons: ['Amount does not closely match.'] }
}

function dateReasons(
  transaction: ReconciliationTransaction,
  payment: ReconciliationPaymentInstance
) {
  const transactionDate = dateOnly(transaction.date)
  const dueDate = dateOnly(payment.effective_due_date)
  const initiatedContextDate = dateOnly(payment.updated_at)
  const reasons: string[] = []
  let score = 0

  if (!transactionDate || !dueDate) {
    return { score, reasons: ['Missing transaction or due date.'] }
  }

  const dueDifference = Math.abs(daysBetween(transactionDate, dueDate))

  if (dueDifference <= DATE_WINDOW_DAYS) {
    score += 25
    reasons.push('Transaction date is within the payment due window.')
  }

  if (
    payment.status === 'initiated' &&
    initiatedContextDate &&
    transactionDate >= initiatedContextDate
  ) {
    score += 10
    reasons.push('Initiated payment has a transaction after initiation.')
  }

  if (payment.status === 'initiated' && payment.notes) {
    reasons.push('Initiated payment notes can provide manual context.')
  }

  return { score, reasons }
}

function aliasesForPayment(paymentName: string) {
  const normalizedPaymentName = normalize(paymentName).toLowerCase()

  return [
    normalize(paymentName),
    ...(PAYMENT_ALIASES[normalizedPaymentName] || []),
  ].filter(Boolean)
}

function nameReasons(
  transaction: ReconciliationTransaction,
  payment: ReconciliationPaymentInstance
) {
  const transactionName = normalize(transaction.name)
  const paymentName = normalize(payment.name)
  const identityType = classifyFinancialIdentity(transactionName)
  const reasons: string[] = []
  let score = 0

  if (!transactionName || !paymentName) {
    return { score, reasons: ['Missing transaction or payment name.'] }
  }

  if (
    transactionName.includes(paymentName) ||
    paymentName.includes(transactionName)
  ) {
    score += 30
    reasons.push('Transaction name contains payment name.')
  } else {
    const alias = aliasesForPayment(paymentName).find((candidate) =>
      transactionName.includes(candidate)
    )

    if (alias) {
      score += 25
      reasons.push(`Transaction name matches known alias: ${alias}.`)
    }
  }

  if (
    paymentName === 'SYNCHRONY' &&
    identityType === 'credit_card_payment'
  ) {
    score += 20
    reasons.push('Transaction is classified as a credit card payment.')
  }

  if (['ATM', 'POS'].some((term) => transactionName.includes(term))) {
    score -= 15
    reasons.push('ATM/POS name is generic and lowers confidence.')
  }

  return { score, reasons }
}

function recommendedAction(payment: ReconciliationPaymentInstance) {
  if (payment.status === 'initiated') {
    return `${
      payment.name || 'Payment'
    } is initiated; verify this transaction before confirming it.`
  }

  return `${
    payment.name || 'Payment'
  } is pending; review this possible payment confirmation.`
}

function scoreMatch(
  transaction: ReconciliationTransaction,
  payment: ReconciliationPaymentInstance
): ReconciliationMatch {
  const amount = amountReasons(transaction, payment)
  const date = dateReasons(transaction, payment)
  const name = nameReasons(transaction, payment)
  const statusScore = payment.status === 'initiated' ? 10 : 0
  const statusReason =
    payment.status === 'initiated'
      ? ['Payment is initiated, so a matching transaction is likely confirmation.']
      : ['Payment is pending, so a matching transaction is possible confirmation.']
  const rawConfidence =
    amount.score + date.score + name.score + statusScore
  const cappedConfidence =
    amount.score === 0 ? Math.min(rawConfidence, 49) : rawConfidence
  const confidence = Math.max(0, Math.min(100, cappedConfidence))
  const amountCapReason =
    amount.score === 0
      ? ['No amount similarity, so confidence is capped below proposal level.']
      : []

  return {
    transactionSource: transaction.source,
    transactionId: transaction.id,
    transactionName: transaction.name,
    transactionAmount: Number(transaction.amount || 0),
    transactionDate: transaction.date,
    paymentInstanceId: payment.id,
    paymentName: payment.name,
    paymentAmount: Number(payment.amount || 0),
    paymentStatus: payment.status,
    confidence,
    confidenceLevel: confidenceLevel(confidence),
    reasons: [
      ...amount.reasons,
      ...amountCapReason,
      ...date.reasons,
      ...name.reasons,
      ...statusReason,
    ],
    recommendedActionText: recommendedAction(payment),
  }
}

function bestMatches(
  transactions: ReconciliationTransaction[],
  payments: ReconciliationPaymentInstance[]
) {
  return payments.flatMap((payment) =>
    transactions
      .map((transaction) => scoreMatch(transaction, payment))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
  )
}

function uniqueMatches(matches: ReconciliationMatch[]) {
  const seen = new Set<string>()

  return matches.filter((match) => {
    const key = `${match.paymentInstanceId}:${match.transactionSource}:${match.transactionId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function buildReconciliationMatches({
  transactions,
  payments,
}: {
  transactions: ReconciliationTransaction[]
  payments: ReconciliationPaymentInstance[]
}): ReconciliationResult {
  const openPayments = payments.filter((payment) =>
    OPEN_PAYMENT_STATUSES.includes(payment.status as PaymentStatus)
  )
  const allMatches = uniqueMatches(bestMatches(transactions, openPayments))
    .sort((a, b) => b.confidence - a.confidence)
  const proposedMatches = allMatches.filter((match) => match.confidence >= 50)
  const matchedInitiatedPaymentIds = new Set(
    proposedMatches
      .filter((match) => match.paymentStatus === 'initiated')
      .map((match) => match.paymentInstanceId)
  )

  return {
    highConfidenceMatches: proposedMatches.filter(
      (match) => match.confidenceLevel === 'high'
    ),
    likelyMatches: proposedMatches.filter(
      (match) => match.confidenceLevel === 'likely'
    ),
    possibleMatches: proposedMatches.filter(
      (match) => match.confidenceLevel === 'possible'
    ),
    lowConfidenceMatches: allMatches.filter(
      (match) => match.confidence < 50
    ),
    unmatchedInitiatedPayments: openPayments.filter(
      (payment) =>
        payment.status === 'initiated' &&
        !matchedInitiatedPaymentIds.has(payment.id)
    ),
    allMatches,
  }
}
