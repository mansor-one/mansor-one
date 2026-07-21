import { canonicalCategoryCodeForText, getCategoryByCode } from './categories.ts'
import type { LedgerSummaryTransaction } from './ledger-summary.ts'

export type FinancialImpact =
  | 'expense'
  | 'income'
  | 'debt_reduction'
  | 'refund_or_statement_credit'
  | 'internal_transfer'
  | 'pending'
  | 'unknown'

export type MovementReconciliationContext = {
  status: 'detected' | 'pending_settlement' | 'reconciled' | 'rejected' | string
  obligationName: string | null
}

export type FinancialImpactResult = {
  impact: FinancialImpact
  label: string
  icon: string
  contextText: string | null
  reason: string
}

function metadataString(transaction: LedgerSummaryTransaction, key: string) {
  const value = transaction.metadata[key]
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function metadataBoolean(transaction: LedgerSummaryTransaction, key: string) {
  return transaction.metadata[key] === true
}

function institutionLabel(transaction: LedgerSummaryTransaction) {
  const value = transaction.metadata.institutionName
  if (typeof value !== 'string' || !value.trim() || value === 'Unknown') return null
  return value.replace(/\s+(bank|n\.a\.)$/i, '').trim()
}

function result(
  impact: FinancialImpact,
  label: string,
  icon: string,
  reason: string,
  contextText: string | null = null
): FinancialImpactResult {
  return { impact, label, icon, reason, contextText }
}

export function classifyRecentMovementImpact(
  transaction: LedgerSummaryTransaction,
  reconciliation: MovementReconciliationContext | null = null
): FinancialImpactResult {
  const categoryCode = canonicalCategoryCodeForText(transaction.category)
  const category = categoryCode ? getCategoryByCode(categoryCode) : null
  const entryType = metadataString(transaction, 'entryType')
  const description = String(transaction.description || '').toUpperCase()
  const accountType = metadataString(transaction, 'accountType')
  const accountSubtype = metadataString(transaction, 'accountSubtype')
  const plaidCategory = metadataString(transaction, 'plaidCategory')
  const pending =
    metadataBoolean(transaction, 'pending') ||
    metadataBoolean(transaction, 'plaidPending') ||
    metadataString(transaction, 'transactionStatus') === 'pending' ||
    reconciliation?.status === 'pending_settlement'

  if (pending) {
    return result(
      'pending', 'Pending', '⏳',
      reconciliation?.status === 'pending_settlement'
        ? 'Manual payment confirmation is awaiting settlement evidence.'
        : 'Plaid lifecycle metadata marks this movement pending.',
      reconciliation?.status === 'pending_settlement' ? 'Payment pending settlement' : null
    )
  }

  if (reconciliation?.status === 'reconciled') {
    return result(
      'debt_reduction', 'Debt reduction', '↘',
      'A permanent reconciliation link connects this transaction to an obligation.',
      reconciliation.obligationName
        ? `Reconciled ${reconciliation.obligationName}`
        : institutionLabel(transaction)
          ? `Reduced the ${institutionLabel(transaction)} balance`
          : null
    )
  }

  const statementCredit =
    description.includes('PAYYOURSELFBACK CREDIT') ||
    description.includes('STATEMENT CREDIT') ||
    entryType === 'refund' ||
    entryType === 'credit' ||
    categoryCode === 'income_refund' ||
    plaidCategory.includes('refund')
  if (statementCredit) {
    const creditAccount = accountType.includes('credit') || accountSubtype.includes('credit')
    return result(
      'refund_or_statement_credit', 'Refund or statement credit', '↩',
      'Canonical category, transaction type, or statement-credit metadata identifies a credit.',
      creditAccount && institutionLabel(transaction)
        ? `Reduced the ${institutionLabel(transaction)} balance`
        : null
    )
  }

  const isAuthoritativeDebtType =
    entryType === 'payment' ||
    entryType === 'debt_payment' ||
    category?.kind === 'payment' ||
    categoryCode?.startsWith('debt_') === true
  if (isAuthoritativeDebtType) {
    return result(
      'debt_reduction', 'Debt reduction', '↘',
      'Canonical transaction type or category identifies a debt payment.',
      institutionLabel(transaction) ? `Reduced the ${institutionLabel(transaction)} balance` : null
    )
  }

  if (entryType === 'transfer' || category?.kind === 'transfer') {
    return result(
      'internal_transfer', 'Internal transfer', '⇄',
      'Canonical transaction type or category identifies a transfer.'
    )
  }

  if (entryType === 'income' || category?.kind === 'income') {
    return result(
      'income', 'Income', '＋',
      'Canonical transaction type or category identifies income.'
    )
  }

  if (entryType === 'expense' || entryType === 'regular_expense' || category?.kind === 'expense') {
    return result(
      'expense', 'Expense', '−',
      'Canonical transaction type or category identifies an expense.'
    )
  }

  return result(
    'unknown', 'Unknown', '?',
    'No authoritative category, transaction type, reconciliation, or Plaid lifecycle signal determines impact.'
  )
}
