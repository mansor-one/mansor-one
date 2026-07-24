import type { PaymentInstance } from '../financial-engine/types'

const INTERNAL_NOTE_PATTERNS = [
  /\bproject phoenix\b/i,
  /\b(?:scheduled_payments|payment_instances|liabilities|obligations|obligation_instances)\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
]

export function lifecyclePaymentDueDate(payment: PaymentInstance) {
  return (
    payment.due_date || payment.expected_date || payment.effective_due_date || null
  )
}

export function lifecyclePaymentGraceUntilDate(payment: PaymentInstance) {
  const dueDate = lifecyclePaymentDueDate(payment)
  const graceDate =
    payment.grace_until ||
    payment.grace_due_date ||
    payment.effective_due_date ||
    null

  if (!dueDate || !graceDate || dueDate === graceDate) return null

  return graceDate
}

export function lifecyclePaymentGraceDays(payment: PaymentInstance) {
  return Number(payment.grace_days || 0)
}

export function friendlyLifecyclePaymentNotes(payment: PaymentInstance) {
  const displayNotes = String(payment.displayNotes || '').trim()
  if (displayNotes) return displayNotes

  const notes = String(payment.notes || '').trim()
  if (!notes) return null

  if (INTERNAL_NOTE_PATTERNS.some((pattern) => pattern.test(notes))) {
    return null
  }

  return notes
}
