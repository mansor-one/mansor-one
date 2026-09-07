import { normalizeMerchantAlias } from './merchant-normalization.ts'

export type ObligationMatchTermSource = 'obligation_name' | 'provider' | 'legacy_alias'

export type ObligationMatchTerm = {
  value: string
  source: ObligationMatchTermSource
}

// Technical debt: these aliases predate structured obligation aliases. Keep
// them behind this service boundary so a future obligation_match_aliases table
// can replace this source without changing the reconciliation engine.
const LEGACY_PAYMENT_ALIASES: Record<string, string[]> = {
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

function normalized(value: string | null | undefined) {
  return normalizeMerchantAlias(value)
}

function legacyAliasesForName(name: string | null | undefined) {
  const normalizedName = normalized(name).toLowerCase()
  return Object.entries(LEGACY_PAYMENT_ALIASES)
    .filter(([key]) => normalizedName === key || normalizedName.includes(key))
    .flatMap(([, aliases]) => aliases)
}

export function obligationMatchTerms({
  name,
  providerName,
}: {
  name: string | null | undefined
  providerName?: string | null
}): ObligationMatchTerm[] {
  const candidates: ObligationMatchTerm[] = [
    { value: normalized(name), source: 'obligation_name' },
    { value: normalized(providerName), source: 'provider' },
    ...legacyAliasesForName(name).map((alias) => ({
      value: normalized(alias),
      source: 'legacy_alias' as const,
    })),
  ]
  const seen = new Set<string>()

  return candidates.filter((candidate) => {
    if (!candidate.value || seen.has(candidate.value)) return false
    seen.add(candidate.value)
    return true
  })
}
