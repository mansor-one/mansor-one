export type DebtReductionCreditInput = {
  description?: string | null
  amount?: number | null
  accountType?: string | null
  accountSubtype?: string | null
  category?: string | null
}

export type DebtReductionCreditKind =
  | 'statement_credit'
  | 'pay_yourself_back'
  | 'rewards_redemption'
  | 'cashback_credit'
  | 'bank_issued_credit'

const CREDIT_ACCOUNT_TERMS = [
  'CREDIT',
  'CREDIT CARD',
  'CARD',
  'REVOLVING',
]

const CREDIT_PATTERNS: Array<{
  kind: DebtReductionCreditKind
  patterns: string[]
}> = [
  {
    kind: 'pay_yourself_back',
    patterns: ['PAYYOURSELFBACK', 'PAY YOURSELF BACK'],
  },
  {
    kind: 'statement_credit',
    patterns: ['STATEMENT CREDIT', 'STATEMENT CR'],
  },
  {
    kind: 'rewards_redemption',
    patterns: [
      'REWARDS REDEMPTION',
      'REWARD REDEMPTION',
      'REDEMPTION CREDIT',
      'REWARDS CREDIT',
      'REWARD CREDIT',
    ],
  },
  {
    kind: 'cashback_credit',
    patterns: ['CASHBACK', 'CASH BACK'],
  },
  {
    kind: 'bank_issued_credit',
    patterns: ['ACCOUNT CREDIT', 'CARD CREDIT', 'COURTESY CREDIT'],
  },
]

function normalized(value: unknown) {
  return String(value || '').trim().toUpperCase()
}

export function classifyDebtReductionCredit(
  input: DebtReductionCreditInput
): { kind: DebtReductionCreditKind; label: string } | null {
  // Plaid represents an amount credited to an account as a negative value.
  // Requiring both that direction and a credit-account signal prevents a
  // checking-account reward deposit from being treated as card debt reduction.
  if (!(Number(input.amount) < 0)) return null

  const accountSignal = normalized(
    [input.accountType, input.accountSubtype].filter(Boolean).join(' ')
  )
  if (!CREDIT_ACCOUNT_TERMS.some((term) => accountSignal.includes(term))) {
    return null
  }

  const evidence = normalized([input.description, input.category].filter(Boolean).join(' '))
  const match = CREDIT_PATTERNS.find(({ patterns }) =>
    patterns.some((pattern) => evidence.includes(pattern))
  )
  if (!match) return null

  const labels: Record<DebtReductionCreditKind, string> = {
    statement_credit: 'Statement credit',
    pay_yourself_back: 'Pay Yourself Back credit',
    rewards_redemption: 'Rewards redemption credit',
    cashback_credit: 'Cashback statement credit',
    bank_issued_credit: 'Bank-issued account credit',
  }

  return { kind: match.kind, label: labels[match.kind] }
}

export function hasDebtReductionCreditPattern(input: {
  description?: string | null
  category?: string | null
}) {
  const evidence = normalized([input.description, input.category].filter(Boolean).join(' '))
  return CREDIT_PATTERNS.some(({ patterns }) =>
    patterns.some((pattern) => evidence.includes(pattern))
  )
}

export function obligationEvidenceCoverage(
  expectedAmount: number,
  evidenceAmounts: Array<number | null | undefined>
) {
  const totalEvidenceAmount = evidenceAmounts.reduce(
    (total: number, amount) => total + Math.abs(Number(amount || 0)),
    0
  )
  const reconciledAmount = expectedAmount > 0
    ? Math.min(totalEvidenceAmount, expectedAmount)
    : 0
  return {
    totalEvidenceAmount,
    reconciledAmount,
    obligationSatisfied:
      expectedAmount > 0 && totalEvidenceAmount + 0.009 >= expectedAmount,
    excessUnallocated:
      expectedAmount > 0 ? Math.max(0, totalEvidenceAmount - expectedAmount) : 0,
  }
}
