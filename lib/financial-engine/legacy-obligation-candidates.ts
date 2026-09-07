import {
  buildReconciliationMatches,
  type ReconciliationMatch,
  type ReconciliationTransaction,
} from './reconciliation.ts'

export type LegacyObligationCandidate = {
  id?: string
  entry_date: string
  description: string
  amount: number
  account_name: string | null
  exactAmount: boolean
  source?: 'quick_entries' | 'plaid_imports'
  plaid_transaction_id?: string | null
  institution_name?: string | null
  account_type?: string | null
  account_subtype?: string | null
  plaid_account_id?: string | null
  category?: string | null
  score?: number
  reasons?: string[]
  contextualMatch?: boolean
  contextTerms?: string[]
  amountBehavior?: 'fixed' | 'estimated'
  requiresManualConfirmation?: boolean
}

export type UnpromotedPlaidCandidate = {
  household_id: string
  imported: boolean | null
  pending: boolean
  transaction_status: string
  removed_at: string | null
  superseded_at: string | null
  transaction_date: string | null
}

function normalized(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function dateInRange(value: string | null, start: string, end: string) {
  const date = value?.slice(0, 10) || ''
  return Boolean(date && date >= start && date <= end)
}

export function isEligibleUnpromotedPlaidCandidate(
  candidate: UnpromotedPlaidCandidate,
  householdId: string,
  startDate: string,
  endDate: string
) {
  return candidate.household_id === householdId &&
    candidate.imported === false &&
    candidate.pending === false &&
    candidate.transaction_status === 'active' &&
    candidate.removed_at === null &&
    candidate.superseded_at === null &&
    dateInRange(candidate.transaction_date, startDate, endDate)
}

function discoveryScore(match: ReconciliationMatch) {
  return match.scoreFactors.reduce(
    (total, factor) => total + Math.max(0, factor.score),
    0
  )
}

function contextualMatch(match: ReconciliationMatch) {
  return match.scoreFactors.some((factor) =>
    factor.passed && [
      'merchant_pattern_match',
      'provider_match',
      'obligation_context_match',
      'institution_match',
      'payment_account_match',
      'funding_account_match',
      'identity_match',
      'identity_compatible',
    ].includes(factor.code)
  )
}

export function rankLegacyObligationCandidates<
  T extends LegacyObligationCandidate,
>({
  candidates,
  paymentName,
  expectedAmount,
  expectedDate,
  fundingPlaidAccountId,
  fundingAccountName,
  amountIsEstimated = false,
  providerName,
  obligationType,
  categoryCode,
  contextNotes,
}: {
  candidates: T[]
  paymentName: string
  expectedAmount: number
  expectedDate: string
  fundingPlaidAccountId?: string | null
  fundingAccountName?: string | null
  amountIsEstimated?: boolean
  providerName?: string | null
  obligationType?: string | null
  categoryCode?: string | null
  contextNotes?: string | null
}) {
  return candidates.map((candidate) => {
    const transaction: ReconciliationTransaction = {
      source: candidate.source || 'quick_entries',
      id: candidate.id || candidate.plaid_transaction_id || candidate.description,
      name: candidate.description,
      amount: candidate.amount,
      date: candidate.entry_date,
      institutionName: candidate.institution_name,
      accountName: candidate.account_name,
      accountType: candidate.account_type,
      accountSubtype: candidate.account_subtype,
      category: candidate.category,
      plaidAccountId: candidate.plaid_account_id,
    }
    const match = buildReconciliationMatches({
      transactions: [transaction],
      payments: [{
        id: 'legacy-obligation-candidate',
        name: paymentName,
        amount: expectedAmount,
        status: 'pending',
        effective_due_date: expectedDate,
        recurrence: 'monthly',
        fundingPlaidAccountId,
        fundingAccountName,
        amountIsEstimated,
        providerName,
        obligationType,
        categoryCode,
        contextNotes,
      }],
    }).allMatches[0]

    return {
      ...candidate,
      score: match ? discoveryScore(match) : 0,
      reasons: match?.reasons || [],
      contextualMatch: match ? contextualMatch(match) : false,
      contextTerms: match && contextualMatch(match) ? [paymentName] : [],
      amountBehavior: match?.amountBehavior || (amountIsEstimated ? 'estimated' : 'fixed'),
      requiresManualConfirmation: match?.requiresManualConfirmation || false,
    }
  }).sort((left, right) =>
    Number(right.contextualMatch) - Number(left.contextualMatch) ||
    Number(right.score || 0) - Number(left.score || 0) ||
    Number(right.exactAmount) - Number(left.exactAmount) ||
    right.entry_date.localeCompare(left.entry_date)
  )
}

export function deduplicateLegacyObligationCandidates<
  C extends LegacyObligationCandidate,
  P extends LegacyObligationCandidate,
>(confirmed: C[], pending: P[]): Array<C | P> {
  const confirmedTransactionIds = new Set(
    confirmed.map((candidate) => candidate.plaid_transaction_id).filter(Boolean)
  )
  return [
    ...confirmed,
    ...pending.filter((candidate) =>
      !candidate.plaid_transaction_id ||
      !confirmedTransactionIds.has(candidate.plaid_transaction_id)
    ),
  ]
}

export function filterLegacyObligationCandidates<
  T extends LegacyObligationCandidate,
>(candidates: T[], search: string) {
  const query = normalized(search)
  if (!query) return { candidates, usedExactAmountFallback: false }

  const matching = candidates.filter((candidate) =>
    [
      candidate.entry_date,
      candidate.description,
      candidate.account_name,
      candidate.amount,
      ...(candidate.contextualMatch ? [candidate.reasons?.join(' ')] : []),
      ...(candidate.contextTerms || []),
    ].some((value) => normalized(value).includes(query))
  )

  if (matching.length > 0) {
    return { candidates: matching, usedExactAmountFallback: false }
  }

  return {
    candidates: candidates.filter((candidate) => candidate.exactAmount),
    usedExactAmountFallback: true,
  }
}
