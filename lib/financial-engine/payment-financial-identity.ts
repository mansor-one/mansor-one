import type { PaymentInstance } from './types.ts'

const MIGRATED_SCHEDULE_ALIASES: Record<string, string[]> = {
  'honda soraya': ['guagua soraya'],
  'hipoteca casa cayey': ['hipoteca'],
}

function normalizeName(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function legacyScheduledIds(payment: PaymentInstance) {
  const ids = new Set<string>()

  for (const sourceId of payment.legacySourceIds || []) {
    const match = sourceId.match(
      /^scheduled_payments\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
    )
    if (match) ids.add(match[1])
  }

  return ids
}

function sameAmount(left: PaymentInstance, right: PaymentInstance) {
  return Math.round(Number(left.amount || 0) * 100) ===
    Math.round(Number(right.amount || 0) * 100)
}

export function paymentCycleIdentity(payment: PaymentInstance) {
  if (payment.payment_year && payment.payment_month) {
    return `${Number(payment.payment_year)}-${String(Number(payment.payment_month)).padStart(2, '0')}`
  }

  const date = payment.effective_due_date || payment.due_date || payment.expected_date
  return date ? String(date).slice(0, 7) : null
}

function sameCycle(left: PaymentInstance, right: PaymentInstance) {
  const leftCycle = paymentCycleIdentity(left)
  const rightCycle = paymentCycleIdentity(right)
  return Boolean(leftCycle && rightCycle && leftCycle === rightCycle)
}

function knownAlias(legacy: PaymentInstance, canonical: PaymentInstance) {
  const canonicalName = normalizeName(canonical.name)
  const legacyName = normalizeName(legacy.name)
  return (MIGRATED_SCHEDULE_ALIASES[canonicalName] || []).includes(legacyName)
}

function canonicalOwnsLegacyPayment(
  legacy: PaymentInstance,
  canonical: PaymentInstance
) {
  if (canonical.source !== 'obligation' || legacy.source === 'obligation') {
    return false
  }

  // A migration/source link identifies the commitment, not the occurrence.
  // It suppresses a legacy row only when the cycle also agrees.
  if (
    legacy.scheduled_payment_id &&
    legacyScheduledIds(canonical).has(legacy.scheduled_payment_id)
  ) {
    if (sameCycle(legacy, canonical)) return true

    // A different cycle may only be removed with an explicit instance-level
    // replacement/carry-forward marker. A schedule-level migration is not
    // sufficient evidence that an older debt disappeared.
    const legacyNotes = String(legacy.notes || '').toLowerCase()
    const canonicalInstanceId = String(
      canonical.obligationInstanceId || canonical.id || ''
    ).replace(/^obligation:/, '').toLowerCase()
    return Boolean(
      canonicalInstanceId &&
      [
        `replaced_by_obligation_instance.${canonicalInstanceId}`,
        `carry_forward_to_obligation_instance.${canonicalInstanceId}`,
        `migrated_instance.${canonicalInstanceId}`,
      ].some((marker) => legacyNotes.includes(marker))
    )
  }

  // Conservative fallback for older migrations without a structured source
  // link: amount, exact cycle date, and a reviewed alias must all agree.
  return sameAmount(legacy, canonical) &&
    sameCycle(legacy, canonical) &&
    knownAlias(legacy, canonical)
}

export function financialCommitmentIdentity(
  payment: PaymentInstance,
  payments: PaymentInstance[] = []
) {
  if (payment.obligationId) return `obligation:${payment.obligationId}`

  if (payment.scheduled_payment_id) {
    const canonical = payments.find(
      (candidate) =>
        candidate.source === 'obligation' &&
        legacyScheduledIds(candidate).has(String(payment.scheduled_payment_id))
    )
    if (canonical?.obligationId) return `obligation:${canonical.obligationId}`
    return `schedule:${payment.scheduled_payment_id}`
  }

  return `payment:${payment.id}`
}

export function canonicalCommitmentName(
  payment: PaymentInstance,
  payments: PaymentInstance[]
) {
  if (payment.source === 'obligation') return payment.name || 'Pago'
  const canonical = payments.find(
    (candidate) =>
      candidate.source === 'obligation' &&
      payment.scheduled_payment_id &&
      legacyScheduledIds(candidate).has(String(payment.scheduled_payment_id))
  )
  return canonical?.name || payment.name || 'Pago'
}

export function deduplicateLifecyclePaymentsByFinancialIdentity(
  payments: PaymentInstance[]
) {
  const canonicalPayments = payments.filter(
    (payment) => payment.source === 'obligation'
  )
  if (!canonicalPayments.length) return payments

  return payments.filter((payment) =>
    payment.source === 'obligation' ||
    !canonicalPayments.some((canonical) =>
      canonicalOwnsLegacyPayment(payment, canonical)
    )
  )
}
