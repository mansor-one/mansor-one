type PaymentLinkRecord = {
  reconciliation_status?: unknown
  plaid_import_id?: unknown
  quick_entry_id?: unknown
  reported_amount?: unknown
  confirmed_at?: unknown
  payment_method?: unknown
  payment_account_id?: unknown
  payment_account_source?: unknown
  confirmation_note?: unknown
}

type InstanceRecord = {
  status?: unknown
  amount_expected?: unknown
  updated_at?: unknown
}

type ObligationRecord = {
  payment_method?: unknown
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

export function obligationPaymentEditState({
  instance,
  obligation,
  paymentLinks,
}: {
  instance: InstanceRecord
  obligation: ObligationRecord | null
  paymentLinks: PaymentLinkRecord[]
}) {
  const pendingLink = paymentLinks.find((link) =>
    link.reconciliation_status === 'pending_settlement' &&
    !link.plaid_import_id &&
    !link.quick_entry_id
  ) || null
  const detectedCandidate = paymentLinks.find((link) =>
    link.reconciliation_status === 'detected' && Boolean(link.plaid_import_id)
  ) || null

  if (pendingLink) {
    return {
      settlementState: 'pending_settlement' as const,
      candidateState: detectedCandidate ? 'possible_match' as const : null,
      canEditReportedPayment: true,
      submissionMethod: 'PATCH' as const,
      source: 'pending_payment_link' as const,
      reportedPayment: {
        reportedAmount: Number(pendingLink.reported_amount ?? instance.amount_expected ?? 0),
        confirmedAt: optionalString(pendingLink.confirmed_at),
        paymentMethod: optionalString(pendingLink.payment_method) || optionalString(obligation?.payment_method),
        paymentAccountId: optionalString(pendingLink.payment_account_id),
        paymentAccountSource: optionalString(pendingLink.payment_account_source),
        note: optionalString(pendingLink.confirmation_note),
      },
    }
  }

  if (instance.status === 'initiated' || detectedCandidate) {
    return {
      settlementState: instance.status === 'initiated' ? 'pending_settlement' as const : null,
      candidateState: detectedCandidate ? 'possible_match' as const : null,
      canEditReportedPayment: true,
      submissionMethod: 'POST' as const,
      source: instance.status === 'initiated'
        ? 'legacy_initiated_instance' as const
        : 'possible_match_instance' as const,
      reportedPayment: {
        reportedAmount: Number(instance.amount_expected ?? 0),
        confirmedAt: optionalString(instance.updated_at),
        paymentMethod: optionalString(obligation?.payment_method),
        paymentAccountId: null,
        paymentAccountSource: null,
        note: null,
      },
    }
  }

  return {
    settlementState: null,
    candidateState: detectedCandidate ? 'possible_match' as const : null,
    canEditReportedPayment: false,
    submissionMethod: null,
    source: null,
    reportedPayment: null,
  }
}
