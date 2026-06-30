const CHANNEL_PREFIX_PATTERNS = [
  /^EXTENDPAY\s+\d+\s+PLAN\s+(?=\S)/,
  /^EXTENDPAY\s+PLAN\s+(?=\S)/,
  /^PLAN\s+(?=\S)/,
  /^TRANF\s+ATHM\s+/,
  /^TRANSF\s+ATHM\s+/,
  /^TRANSFER\s+ATHM\s+/,
  /^ATH\s+MOVIL\s+/,
  /^ATHM\s+/,
  /^ATH\s+/,
]

function normalizeBase(value: string | null | undefined) {
  return String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' AND ')
    .replace(/[#*]\s*\d+/g, ' ')
    .replace(/[._,-]/g, ' ')
    .replace(/\bSTORE\b/g, ' ')
    .replace(/\bPUERTO\s+RICO\b/g, ' ')
    .replace(/\bPR\b/g, ' ')
    .replace(/\bINCORPORATED\b/g, ' ')
    .replace(/\bCORPORATION\b/g, ' ')
    .replace(/\bCORP\b/g, ' ')
    .replace(/\bINC\b/g, ' ')
    .replace(/\bLLC\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeKnownMerchant(value: string) {
  if (
    value === 'CHURCHS' ||
    value === "CHURCH'S" ||
    value === 'CHURCH CHICKEN'
  ) {
    return "CHURCH'S"
  }

  if (value.startsWith('STARBUCKS')) return 'STARBUCKS'

  if (/^MI FARMACIA(?:\s+[A-Z])?$/.test(value)) return 'MI FARMACIA'

  return value
}

export function normalizeMerchantText(value: string | null | undefined) {
  return normalizeKnownMerchant(normalizeBase(value))
}

export function normalizeMerchantAlias(value: string | null | undefined) {
  let normalized = normalizeBase(value)
  let previous = ''

  while (normalized && normalized !== previous) {
    previous = normalized
    CHANNEL_PREFIX_PATTERNS.forEach((pattern) => {
      normalized = normalized.replace(pattern, '')
    })
    normalized = normalized.replace(/\s+/g, ' ').trim()
  }

  return normalizeKnownMerchant(normalized)
}
