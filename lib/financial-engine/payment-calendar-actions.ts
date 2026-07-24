import type { PaymentInstance } from './types'

export function paymentCalendarActions(payment: PaymentInstance) {
  const possibleMatch = payment.truthStatus === 'possible_match'
  const obligationId = payment.obligationInstanceId

  return {
    possibleMatch,
    canEditReportedPayment: possibleMatch && Boolean(obligationId),
    editPaymentHref: possibleMatch && obligationId
      ? `/timeline?obligationId=${encodeURIComponent(obligationId)}&action=edit-payment#payments`
      : null,
    reviewMatchHref: possibleMatch ? '/robototina#recommended-next-moves' : null,
  }
}
