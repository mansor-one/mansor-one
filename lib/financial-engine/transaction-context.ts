import type { LedgerSummaryTransaction } from './ledger-summary'
import { classifyFinancialIdentity } from './financial-identity'
import { normalizeMerchantName } from './merchant-knowledge'

export type TransactionSourceLabel =
  | 'Plaid'
  | 'Manual'
  | 'Gmail'
  | 'ATH'
  | 'Imported Ledger'
  | 'Unknown'

export type PaymentMethodLabel =
  | 'Debit'
  | 'Credit'
  | 'ACH'
  | 'Transfer'
  | 'Unknown'

export type TransactionContext = {
  rawMerchant: string
  normalizedMerchant: string
  institution: string
  accountName: string
  accountMask: string | null
  accountLabel: string
  accountOwner: string
  source: TransactionSourceLabel
  paymentMethod: PaymentMethodLabel
  identity: string
}

function metadataString(
  transaction: LedgerSummaryTransaction,
  key: string
) {
  const value = transaction.metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function lastFour(value: string | null) {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (!digits) return null
  return digits.slice(-4)
}

function displaySource(transaction: LedgerSummaryTransaction): TransactionSourceLabel {
  const source = String(transaction.source || '').toLowerCase()

  if (source.includes('gmail')) return 'Gmail'
  if (source.includes('ath')) return 'ATH'
  if (source.includes('manual')) return 'Manual'
  if (transaction.sourceTable === 'plaid_imports' || source.includes('plaid')) {
    return transaction.imported === true ? 'Imported Ledger' : 'Plaid'
  }
  if (transaction.plaidTransactionId) return 'Imported Ledger'

  return 'Unknown'
}

function paymentMethod(transaction: LedgerSummaryTransaction): PaymentMethodLabel {
  const accountName = metadataString(transaction, 'accountName') || ''
  const accountType = metadataString(transaction, 'accountType') || ''
  const accountSubtype = metadataString(transaction, 'accountSubtype') || ''
  const category = transaction.category || ''
  const source = transaction.source || ''
  const combined = [
    accountName,
    accountType,
    accountSubtype,
    category,
    source,
    transaction.description || '',
  ]
    .join(' ')
    .toLowerCase()

  if (combined.includes('ach') || combined.includes('eft')) return 'ACH'
  if (
    combined.includes('transfer') ||
    combined.includes('transferencia') ||
    combined.includes('ath movil') ||
    combined.includes('athm')
  ) {
    return 'Transfer'
  }
  if (
    combined.includes('credit') ||
    combined.includes('visa') ||
    combined.includes('amex') ||
    combined.includes('freedom') ||
    combined.includes('synchrony')
  ) {
    return 'Credit'
  }
  if (
    combined.includes('debit') ||
    combined.includes('checking') ||
    combined.includes('cash management')
  ) {
    return 'Debit'
  }

  return 'Unknown'
}

export function transactionContext(
  transaction: LedgerSummaryTransaction
): TransactionContext {
  const rawMerchant = transaction.description || 'Unknown merchant'
  const normalizedMerchant = normalizeMerchantName(rawMerchant) || rawMerchant
  const institution = metadataString(transaction, 'institutionName') || 'Unknown'
  const accountName = metadataString(transaction, 'accountName') || 'Unknown'
  const accountMask = lastFour(metadataString(transaction, 'accountMask'))
  const accountLabel = accountMask
    ? `${accountName} ••••${accountMask}`
    : accountName
  const accountOwner = metadataString(transaction, 'owner') || 'Unknown'

  return {
    rawMerchant,
    normalizedMerchant,
    institution,
    accountName,
    accountMask,
    accountLabel,
    accountOwner,
    source: displaySource(transaction),
    paymentMethod: paymentMethod(transaction),
    identity: classifyFinancialIdentity(rawMerchant),
  }
}

export function transactionContextRows(transaction: LedgerSummaryTransaction) {
  const context = transactionContext(transaction)

  return [
    { label: 'Merchant', value: context.normalizedMerchant },
    { label: 'Raw merchant', value: context.rawMerchant },
    { label: 'Institution', value: context.institution },
    { label: 'Account', value: context.accountLabel },
    { label: 'Owner', value: context.accountOwner },
    { label: 'Source', value: context.source },
    { label: 'Payment method', value: context.paymentMethod },
    { label: 'Identity', value: context.identity },
  ]
}
