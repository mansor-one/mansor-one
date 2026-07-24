export type PaymentCorrectionSnapshot = {
  reportedAmount: number
  confirmationDate: string | null
  paymentMethod: string | null
  paymentAccountId: string | null
  paymentAccountSource: string | null
  notePresent: boolean
}

export function paymentCorrectionAuditEvidence({
  previous,
  corrected,
  futureDefault,
}: {
  previous: PaymentCorrectionSnapshot
  corrected: PaymentCorrectionSnapshot
  futureDefault?: { previous: number | null; corrected: number } | null
}) {
  const accountChanged =
    previous.paymentAccountId !== corrected.paymentAccountId ||
    previous.paymentAccountSource !== corrected.paymentAccountSource

  return {
    previous: {
      reported_amount: previous.reportedAmount,
      confirmation_date: previous.confirmationDate,
      payment_method: previous.paymentMethod,
      payment_account_source: previous.paymentAccountSource,
      payment_account_changed: accountChanged,
      note_present: previous.notePresent,
    },
    corrected: {
      reported_amount: corrected.reportedAmount,
      confirmation_date: corrected.confirmationDate,
      payment_method: corrected.paymentMethod,
      payment_account_source: corrected.paymentAccountSource,
      payment_account_changed: accountChanged,
      note_present: corrected.notePresent,
    },
    future_default: futureDefault || null,
  }
}

export function futureDefaultAmountUpdate(reportedAmount: number) {
  return { default_amount: Number(reportedAmount.toFixed(2)) }
}
