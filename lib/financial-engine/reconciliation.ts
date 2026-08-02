import {
  OPEN_PAYMENT_STATUSES,
  buildPaymentLifecycleSnapshot,
  type PaymentLifecycleSnapshot,
  type PaymentStatus,
} from '../finance/paymentLifecycle.ts'
import {
  analyzeFinancialIdentity,
  normalizeFinancialIdentityName,
} from './financial-identity.ts'
import { normalizeMerchantAlias } from './merchant-normalization.ts'
import {
  classifyDebtReductionCredit,
  hasDebtReductionCreditPattern,
} from './debt-reduction-credit.ts'

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
  institutionName?: string | null
  accountName?: string | null
  accountType?: string | null
  accountSubtype?: string | null
  category?: string | null
  plaidAccountId?: string | null
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
  recurrence?: string | null
  fundingPlaidAccountId?: string | null
  fundingAccountName?: string | null
}

export type ReconciliationScoreFactor = {
  code: string
  label: string
  score: number
  passed: boolean
  details: string
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
  amountDifference: number
  dateDifferenceDays: number | null
  transactionInstitution: string | null
  transactionAccountName: string | null
  transactionAccountType: string | null
  paymentTimeline: PaymentLifecycleSnapshot
  scoreFactors: ReconciliationScoreFactor[]
  confidence: number
  confidenceLevel: ReconciliationConfidenceLevel
  eligible: boolean
  ineligibilityReasons: string[]
  evidenceSide: 'funding_outflow' | 'obligation_credit' | 'unknown'
  evidenceKind: 'payment' | 'debt_reduction_credit'
  satisfiesAmount: 'full' | 'partial' | 'none'
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

function includesAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern))
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

function factor({
  code,
  label,
  score,
  passed,
  details,
}: ReconciliationScoreFactor): ReconciliationScoreFactor {
  return { code, label, score, passed, details }
}

function transactionIdentity(transaction: ReconciliationTransaction) {
  return analyzeFinancialIdentity({
    name: transaction.name,
    institutionName: transaction.institutionName,
    accountName: transaction.accountName,
    accountType: transaction.accountType,
    accountSubtype: transaction.accountSubtype,
    category: transaction.category,
    amount: transaction.amount,
    date: transaction.date,
  })
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
    return {
      score: 15,
      exact: true,
      amountDifference: difference,
      reasons: ['Exact amount match.'],
      factors: [
        factor({
          code: 'amount_exact',
          label: 'Amount',
          score: 15,
          passed: true,
          details: 'Exact amount match.',
        }),
      ],
    }
  }

  if (difference <= 1) {
    return {
      score: 10,
      exact: false,
      amountDifference: difference,
      reasons: ['Amount is within $1.'],
      factors: [
        factor({
          code: 'amount_close',
          label: 'Amount',
          score: 10,
          passed: true,
          details: 'Amount is within $1.',
        }),
      ],
    }
  }

  if (percentDifference <= 0.05) {
    return {
      score: 7,
      exact: false,
      amountDifference: difference,
      reasons: ['Amount is within 5%.'],
      factors: [
        factor({
          code: 'amount_near',
          label: 'Amount',
          score: 7,
          passed: true,
          details: 'Amount is within 5%.',
        }),
      ],
    }
  }

  return {
    score: 0,
    exact: false,
    amountDifference: difference,
    reasons: ['Amount does not closely match.'],
    factors: [
      factor({
        code: 'amount_mismatch',
        label: 'Amount',
        score: 0,
        passed: false,
        details: 'Amount does not closely match.',
      }),
    ],
  }
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
    return {
      score,
      dateDifferenceDays: null,
      reasons: ['Missing transaction or due date.'],
      factors: [
        factor({
          code: 'date_missing',
          label: 'Date',
          score: 0,
          passed: false,
          details: 'Missing transaction or due date.',
        }),
      ],
    }
  }

  const dueDifference = Math.abs(daysBetween(transactionDate, dueDate))

  if (dueDifference <= DATE_WINDOW_DAYS) {
    score += 10
    reasons.push('Transaction date is within the payment due window.')
  }

  if (
    payment.status === 'initiated' &&
    initiatedContextDate &&
    transactionDate >= initiatedContextDate
  ) {
    score += 5
    reasons.push('Initiated payment has a transaction after initiation.')
  }

  if (payment.status === 'initiated' && payment.notes) {
    reasons.push('Initiated payment notes can provide manual context.')
  }

  return {
    score,
    dateDifferenceDays: dueDifference,
    reasons,
    factors: [
      factor({
        code: dueDifference <= DATE_WINDOW_DAYS ? 'date_window' : 'date_far',
        label: 'Date',
        score,
        passed: dueDifference <= DATE_WINDOW_DAYS,
        details:
          dueDifference <= DATE_WINDOW_DAYS
            ? 'Transaction date is within the payment due window.'
            : 'Transaction date is outside the payment due window.',
      }),
    ],
  }
}

function aliasesForPayment(paymentName: string) {
  const normalizedPaymentName = normalize(paymentName).toLowerCase()

  return [
    normalize(paymentName),
    normalizeMerchantAlias(paymentName),
    ...(PAYMENT_ALIASES[normalizedPaymentName] || []),
  ]
    .map((alias) => normalizeMerchantAlias(alias) || normalize(alias))
    .filter(Boolean)
}

function nameReasons(
  transaction: ReconciliationTransaction,
  payment: ReconciliationPaymentInstance
) {
  const transactionName = normalize(transaction.name)
  const transactionAlias = normalizeMerchantAlias(transaction.name)
  const paymentName = normalize(payment.name)
  const identity = transactionIdentity(transaction)
  const reasons: string[] = []
  let score = 0

  if (!transactionName || !paymentName) {
    return {
      score,
      reasons: ['Missing transaction or payment name.'],
      factors: [
        factor({
          code: 'merchant_pattern_missing',
          label: 'Merchant pattern',
          score: 0,
          passed: false,
          details: 'Missing transaction or payment name.',
        }),
      ],
    }
  }

  if (
    transactionName.includes(paymentName) ||
    paymentName.includes(transactionName) ||
    (transactionAlias &&
      (transactionAlias.includes(paymentName) ||
        paymentName.includes(transactionAlias)))
  ) {
    score += 20
    reasons.push('Transaction name contains payment name.')
  } else {
    const alias = aliasesForPayment(paymentName).find((candidate) =>
      transactionName.includes(candidate) || transactionAlias.includes(candidate)
    )

    if (alias) {
      score += 18
      reasons.push(`Transaction name matches known alias: ${alias}.`)
    }
  }

  if (
    paymentName === 'SYNCHRONY' &&
    identity.identityType === 'credit_card_payment'
  ) {
    score += 10
    reasons.push('Transaction is classified as a credit card payment.')
  }

  if (['ATM', 'POS'].some((term) => transactionName.includes(term))) {
    score -= 15
    reasons.push('ATM/POS name is generic and lowers confidence.')
  }

  return {
    score,
    reasons,
    factors: [
      factor({
        code: score > 0 ? 'merchant_pattern_match' : 'merchant_pattern_weak',
        label: 'Merchant pattern',
        score,
        passed: score > 0,
        details:
          reasons.join(' ') || 'No merchant pattern connected payment to transaction.',
      }),
    ],
  }
}

function paymentIdentity(payment: ReconciliationPaymentInstance) {
  return analyzeFinancialIdentity({
    name: payment.name,
    amount: payment.amount,
    date: payment.effective_due_date,
  })
}

function identityCompatibilityReasons(
  transaction: ReconciliationTransaction,
  payment: ReconciliationPaymentInstance
) {
  const transactionAnalysis = transactionIdentity(transaction)
  const paymentAnalysis = paymentIdentity(payment)
  const normalizedPaymentName = normalize(payment.name)
  const paymentLooksLikeProtectedBill =
    paymentAnalysis.identityType === 'credit_card_payment' ||
    paymentAnalysis.identityType === 'utility' ||
    paymentAnalysis.identityType === 'loan' ||
    includesAny(normalizedPaymentName, [
      'SYNCHRONY',
      'CREDIT CARD',
      'CR CARD',
      'LUMA',
      'AAA',
      'PRASA',
      'COOP LARES',
    ])

  if (
    transactionAnalysis.identityType === 'government' &&
    paymentLooksLikeProtectedBill
  ) {
    return {
      score: -45,
      incompatible: true,
      reasons: [
        `Identity mismatch: government transaction is not compatible with ${paymentAnalysis.identityType} payment.`,
      ],
      factors: [
        factor({
          code: 'identity_incompatible',
          label: 'Identity compatibility',
          score: -45,
          passed: false,
          details: `Government transaction is not compatible with ${paymentAnalysis.identityType} payment.`,
        }),
      ],
    }
  }

  if (
    transactionAnalysis.identityType === 'credit_card_payment' &&
    ['institution', 'credit_card_payment', 'unknown'].includes(
      paymentAnalysis.identityType
    )
  ) {
    return {
      score: 30,
      incompatible: false,
      reasons: ['Identity is compatible with a card/institution payment.'],
      factors: [
        factor({
          code: 'identity_compatible',
          label: 'Identity compatibility',
          score: 30,
          passed: true,
          details: 'Transaction identity is compatible with this payment.',
        }),
      ],
    }
  }

  return {
    score: 0,
    incompatible: false,
    reasons: [
      `Identity check: ${transactionAnalysis.identityType} transaction compared with ${paymentAnalysis.identityType} payment.`,
    ],
    factors: [
      factor({
        code: 'identity_neutral',
        label: 'Identity compatibility',
        score: 0,
        passed: transactionAnalysis.identityType !== 'unknown',
        details: `${transactionAnalysis.identityType} transaction compared with ${paymentAnalysis.identityType} payment.`,
      }),
    ],
  }
}

function institutionReasons(
  transaction: ReconciliationTransaction,
  payment: ReconciliationPaymentInstance
) {
  const institution = normalize(transaction.institutionName)
  const paymentName = normalize(payment.name)
  const aliases = paymentName ? aliasesForPayment(paymentName) : []
  const matchedAlias = aliases.find((alias) => institution.includes(alias))

  if (institution && (institution.includes(paymentName) || matchedAlias)) {
    const details = matchedAlias
      ? `Institution matches payment alias: ${matchedAlias}.`
      : 'Institution contains payment name.'

    return {
      score: 20,
      reasons: [details],
      factors: [
        factor({
          code: 'institution_match',
          label: 'Institution',
          score: 20,
          passed: true,
          details,
        }),
      ],
    }
  }

  return {
    score: 0,
    reasons: institution
      ? ['Institution does not clearly match payment.']
      : ['No institution signal is available.'],
    factors: [
      factor({
        code: institution ? 'institution_mismatch' : 'institution_missing',
        label: 'Institution',
        score: 0,
        passed: false,
        details: institution
          ? 'Institution does not clearly match payment.'
          : 'No institution signal is available.',
      }),
    ],
  }
}

function accountReasons(
  transaction: ReconciliationTransaction,
  payment: ReconciliationPaymentInstance
) {
  const accountSignal = normalizeFinancialIdentityName(
    [
      transaction.accountName,
      transaction.accountType,
      transaction.accountSubtype,
    ].filter(Boolean).join(' ')
  )
  const paymentName = normalize(payment.name)
  const aliases = paymentName ? aliasesForPayment(paymentName) : []
  const matchedAlias = aliases.find((alias) => accountSignal.includes(alias))
  const hasPaymentAccount =
    accountSignal &&
    (accountSignal.includes(paymentName) ||
      Boolean(matchedAlias) ||
      (accountSignal.includes('CREDIT') &&
        includesAny(paymentName, ['CARD', 'BANK', 'SYNCHRONY'])))

  if (hasPaymentAccount) {
    const details = matchedAlias
      ? `Payment account matches alias: ${matchedAlias}.`
      : 'Payment account is compatible with payment.'

    return {
      score: 15,
      reasons: [details],
      factors: [
        factor({
          code: 'payment_account_match',
          label: 'Payment account',
          score: 15,
          passed: true,
          details,
        }),
      ],
    }
  }

  return {
    score: 0,
    reasons: accountSignal
      ? ['Payment account signal does not clearly match payment.']
      : ['No payment account signal is available.'],
    factors: [
      factor({
        code: accountSignal ? 'payment_account_mismatch' : 'payment_account_missing',
        label: 'Payment account',
        score: 0,
        passed: false,
        details: accountSignal
          ? 'Payment account signal does not clearly match payment.'
          : 'No payment account signal is available.',
      }),
    ],
  }
}

function fundingAccountReasons(
  transaction: ReconciliationTransaction,
  payment: ReconciliationPaymentInstance
) {
  const directMatch = Boolean(
    transaction.plaidAccountId &&
    payment.fundingPlaidAccountId &&
    transaction.plaidAccountId === payment.fundingPlaidAccountId
  )
  const transactionAccount = normalize(
    [transaction.institutionName, transaction.accountName].filter(Boolean).join(' ')
  )
  const fundingAccount = normalize(payment.fundingAccountName)
  const nameMatch = Boolean(
    transactionAccount &&
    fundingAccount &&
    (transactionAccount.includes(fundingAccount) ||
      fundingAccount.includes(transactionAccount))
  )

  if (directMatch || nameMatch) {
    return {
      score: 15,
      evidenceSide: 'funding_outflow' as const,
      reasons: ['Transaction is on the user-reported funding account.'],
      factors: [factor({
        code: 'funding_account_match',
        label: 'Funding account',
        score: 15,
        passed: true,
        details: 'Transaction is on the user-reported funding account.',
      })],
    }
  }

  return {
    score: 0,
    evidenceSide: 'unknown' as const,
    reasons: payment.fundingPlaidAccountId || payment.fundingAccountName
      ? ['Transaction is not on the reported funding account.']
      : ['No structured funding-account signal is available.'],
    factors: [factor({
      code: 'funding_account_missing',
      label: 'Funding account',
      score: 0,
      passed: false,
      details: 'No matching funding-account signal is available.',
    })],
  }
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
  const identity = identityCompatibilityReasons(transaction, payment)
  const institution = institutionReasons(transaction, payment)
  const account = accountReasons(transaction, payment)
  const fundingAccount = fundingAccountReasons(transaction, payment)
  const debtReductionCredit = classifyDebtReductionCredit({
    description: transaction.name,
    amount: transaction.amount,
    accountType: transaction.accountType,
    accountSubtype: transaction.accountSubtype,
    category: transaction.category,
  })
  const misplacedCredit =
    Number(transaction.amount) < 0 &&
    hasDebtReductionCreditPattern({
      description: transaction.name,
      category: transaction.category,
    }) &&
    !debtReductionCredit
  const creditAccountConnected = institution.score > 0 || account.score > 0
  const creditScore = debtReductionCredit && creditAccountConnected ? 30 : 0
  const statusScore = payment.status === 'initiated' ? 10 : 0
  const recurrenceScore = payment.recurrence || payment.scheduled_payment_id ? 5 : 0
  const statusReason =
    payment.status === 'initiated'
      ? ['Payment is initiated, so a matching transaction is likely confirmation.']
      : ['Payment is pending, so a matching transaction is possible confirmation.']
  const rawConfidence =
    identity.score +
    institution.score +
    account.score +
    fundingAccount.score +
    name.score +
    creditScore +
    amount.score +
    date.score +
    recurrenceScore +
    statusScore
  const hasNonAmountSignal =
    identity.score > 0 ||
    institution.score > 0 ||
    account.score > 0 ||
    fundingAccount.score > 0 ||
    name.score > 0
  const exactAmountRequired = !amount.exact && !debtReductionCredit
  const creditEvidenceEligible = Boolean(debtReductionCredit && creditAccountConnected)
  const cappedConfidence = exactAmountRequired
    ? 0
    : identity.incompatible || !hasNonAmountSignal
      ? Math.min(rawConfidence, 49)
      : rawConfidence
  const confidence = Math.max(0, Math.min(100, cappedConfidence))
  const amountCapReason =
    exactAmountRequired
      ? ['Exact amount is required. Partial or split-payment semantics are not enabled.']
      : []
  const identityCapReason =
    identity.incompatible
      ? ['Incompatible identities, so confidence is capped below proposal level.']
      : []
  const amountOnlyCapReason =
    !hasNonAmountSignal
      ? ['No identity, institution, account, or merchant signal, so amount cannot propose a match by itself.']
      : []
  const scoreFactors = [
    ...identity.factors,
    ...institution.factors,
    ...account.factors,
    ...fundingAccount.factors,
    ...name.factors,
    factor({
      code: debtReductionCredit ? 'debt_reduction_credit' : 'debt_reduction_credit_missing',
      label: 'Debt-reduction credit',
      score: creditScore,
      passed: creditEvidenceEligible,
      details: debtReductionCredit
        ? creditAccountConnected
          ? `${debtReductionCredit.label} reduces the obligation account balance.`
          : `${debtReductionCredit.label} lacks an account or institution connection to this obligation.`
        : 'Transaction is not an identified statement or rewards credit.',
    }),
    ...amount.factors,
    ...date.factors,
    factor({
      code: recurrenceScore ? 'recurrence_cycle' : 'recurrence_missing',
      label: 'Recurrence',
      score: recurrenceScore,
      passed: recurrenceScore > 0,
      details: recurrenceScore
        ? 'The transaction falls against a generated recurring obligation cycle.'
        : 'No recurring-cycle signal is available.',
    }),
    factor({
      code: payment.status === 'initiated' ? 'status_initiated' : 'status_open',
      label: 'Payment status',
      score: statusScore,
      passed: payment.status === 'initiated',
      details:
        payment.status === 'initiated'
          ? 'Payment is initiated, so a matching transaction is likely confirmation.'
          : 'Payment is open but not initiated.',
    }),
  ]
  const paymentTimeline = buildPaymentLifecycleSnapshot({
    status: payment.status,
    effectiveDueDate: payment.effective_due_date,
    updatedAt: payment.updated_at,
    hasDetectedTransaction: confidence >= 50,
    hasConfirmedLedgerEntry: transaction.source === 'quick_entries',
  })

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
    amountDifference: amount.amountDifference,
    dateDifferenceDays: date.dateDifferenceDays,
    transactionInstitution: transaction.institutionName || null,
    transactionAccountName: transaction.accountName || null,
    transactionAccountType: transaction.accountType || null,
    paymentTimeline,
    scoreFactors,
    confidence,
    confidenceLevel: confidenceLevel(confidence),
    eligible:
      !misplacedCredit &&
      !identity.incompatible &&
      hasNonAmountSignal &&
      (!exactAmountRequired || creditEvidenceEligible),
    ineligibilityReasons: [
      ...(exactAmountRequired
        ? ['Exact amount is mandatory for normal single-payment reconciliation.']
        : []),
      ...(debtReductionCredit && !creditAccountConnected
        ? ['Debt-reduction credit is not connected to this obligation account.']
        : []),
      ...(misplacedCredit
        ? ['Credit-like movement is not posted to a credit account.']
        : []),
      ...(identity.incompatible ? ['Transaction and obligation identities are incompatible.'] : []),
      ...(!hasNonAmountSignal ? ['No non-amount evidence connects the transaction to the obligation.'] : []),
    ],
    evidenceSide: fundingAccount.evidenceSide === 'funding_outflow'
      ? 'funding_outflow'
      : account.score > 0 || institution.score > 0
        ? 'obligation_credit'
        : 'unknown',
    evidenceKind: debtReductionCredit ? 'debt_reduction_credit' : 'payment',
    satisfiesAmount: debtReductionCredit
      ? Math.abs(Number(transaction.amount || 0)) + 0.009 >= Math.abs(Number(payment.amount || 0))
        ? 'full'
        : 'partial'
      : amount.exact
        ? 'full'
        : 'none',
    reasons: [
      ...amount.reasons,
      ...amountCapReason,
      ...date.reasons,
      ...institution.reasons,
      ...account.reasons,
      ...fundingAccount.reasons,
      ...name.reasons,
      ...identity.reasons,
      ...identityCapReason,
      ...amountOnlyCapReason,
      ...statusReason,
      ...paymentTimeline.reasons,
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
  rejectedMatchKeys = new Set<string>(),
}: {
  transactions: ReconciliationTransaction[]
  payments: ReconciliationPaymentInstance[]
  rejectedMatchKeys?: Set<string>
}): ReconciliationResult {
  const openPayments = payments.filter((payment) =>
    OPEN_PAYMENT_STATUSES.includes(payment.status as PaymentStatus)
  )
  const allMatches = uniqueMatches(bestMatches(transactions, openPayments))
    .filter((match) => !rejectedMatchKeys.has(
      `${match.paymentInstanceId}:${match.transactionSource}:${match.transactionId}`
    ))
    .sort((a, b) => b.confidence - a.confidence)
  const proposedMatches = allMatches.filter(
    (match) => match.eligible && match.confidence >= 50
  )
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
