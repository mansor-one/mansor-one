import type { Transaction, TransactionCounterparty } from 'plaid'

export const PLAID_LOGO_HOSTS = new Set([
  'plaid-merchant-logos.plaid.com',
  'plaid-counterparty-logos.plaid.com',
])

export type MerchantVisualMetadata = {
  merchant_entity_id: string
  merchant_logo_url: string
  merchant_website: string | null
  merchant_confidence: 'HIGH' | 'VERY_HIGH' | null
  merchant_logo_source: 'transaction' | 'counterparty'
}

export function isAllowedPlaidLogoUrl(value: string | null | undefined) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      PLAID_LOGO_HOSTS.has(url.hostname) &&
      !url.username && !url.password &&
      (url.port === '' || url.port === '443')
  } catch {
    return false
  }
}

function confidence(value: string | null | undefined) {
  const normalized = String(value || '').toUpperCase()
  return normalized === 'HIGH' || normalized === 'VERY_HIGH'
    ? normalized as 'HIGH' | 'VERY_HIGH'
    : null
}

function counterpartyCandidate(item: TransactionCounterparty): MerchantVisualMetadata | null {
  const level = confidence(item.confidence_level)
  if (String(item.type).toLowerCase() !== 'merchant' || !level ||
      !item.entity_id || !isAllowedPlaidLogoUrl(item.logo_url)) return null
  return {
    merchant_entity_id: item.entity_id,
    merchant_logo_url: item.logo_url as string,
    merchant_website: item.website || null,
    merchant_confidence: level,
    merchant_logo_source: 'counterparty',
  }
}

export function selectMerchantVisualMetadata(
  transaction: Pick<Transaction, 'merchant_entity_id' | 'logo_url' | 'website' | 'counterparties'>
): MerchantVisualMetadata | null {
  if (transaction.merchant_entity_id && isAllowedPlaidLogoUrl(transaction.logo_url)) {
    return {
      merchant_entity_id: transaction.merchant_entity_id,
      merchant_logo_url: transaction.logo_url as string,
      merchant_website: transaction.website || null,
      merchant_confidence: null,
      merchant_logo_source: 'transaction',
    }
  }

  const candidates = (transaction.counterparties || [])
    .map(counterpartyCandidate)
    .filter((item): item is MerchantVisualMetadata => item !== null)
  const entities = new Set(candidates.map((item) => item.merchant_entity_id))
  if (entities.size !== 1) return null
  return candidates.sort((a, b) =>
    (b.merchant_confidence === 'VERY_HIGH' ? 2 : 1) -
    (a.merchant_confidence === 'VERY_HIGH' ? 2 : 1)
  )[0] || null
}

export function emptyMerchantVisualMetadata() {
  return {
    merchant_entity_id: null,
    merchant_logo_url: null,
    merchant_website: null,
    merchant_confidence: null,
    merchant_logo_source: null,
  }
}
