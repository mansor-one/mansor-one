export const reviewTransactionTypes = [
  'regular_expense',
  'goal_event',
  'debt_payment',
  'transfer',
  'non_spending',
  'ignore',
] as const

export type ReviewTransactionType = (typeof reviewTransactionTypes)[number]

export function isReviewTransactionType(value: unknown): value is ReviewTransactionType {
  return reviewTransactionTypes.includes(value as ReviewTransactionType)
}

export function decisionRequiresPlanningFund(value: ReviewTransactionType) {
  return value === 'goal_event'
}

export function confirmedEntryType(value: ReviewTransactionType) {
  if (value === 'debt_payment') return 'payment'
  if (value === 'transfer') return 'transfer'
  if (value === 'non_spending') return 'non_spending'
  if (value === 'ignore') return null
  return 'expense'
}
