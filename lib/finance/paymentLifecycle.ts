import {
  getObligationsSummary,
  type EnrichedObligationInstance,
} from '../financial-engine/obligations.ts'
import type {
  FinancialSupabaseClient,
  PaymentInstance,
} from '../financial-engine/types.ts'

export const PAYMENT_LIFECYCLE_STATES = [
  'pending',
  'initiated',
  'confirmed',
] as const

export type PaymentLifecycleState = (typeof PAYMENT_LIFECYCLE_STATES)[number]

export const PAYMENT_TIMELINE_STATES = [
  'expected',
  'initiated',
  'detected',
  'confirmed',
  'closed',
  'overdue',
  'missed',
  'late',
  'duplicate',
  'cancelled',
] as const

export type PaymentTimelineState = (typeof PAYMENT_TIMELINE_STATES)[number]

export const LEGACY_PAYMENT_STATUSES = ['promise', 'paid', 'closed'] as const

export type LegacyPaymentStatus = (typeof LEGACY_PAYMENT_STATUSES)[number]

export type PaymentStatus = PaymentLifecycleState | LegacyPaymentStatus

export const OPEN_PAYMENT_STATUSES: PaymentStatus[] = [
  'pending',
  'initiated',
  'promise',
]

export const CLOSED_PAYMENT_STATUSES: PaymentStatus[] = [
  'confirmed',
  'paid',
  'closed',
]

export type PaymentLifecycleSnapshotInput = {
  status: PaymentStatus | string | null
  effectiveDueDate: string | null
  updatedAt?: string | null
  hasDetectedTransaction?: boolean
  hasConfirmedLedgerEntry?: boolean
  hasDuplicateCandidate?: boolean
  today?: string
}

export type PaymentLifecycleSnapshot = {
  state: PaymentTimelineState
  label: string
  isOpen: boolean
  isLate: boolean
  isTerminal: boolean
  daysFromDueDate: number | null
  reasons: string[]
}

export type ObligationLifecyclePaymentOptions = {
  today?: string
}

function dateOnly(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function daysBetween(left: Date, right: Date) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000
  return Math.round((left.getTime() - right.getTime()) / millisecondsPerDay)
}

function labelForTimelineState(state: PaymentTimelineState) {
  return state
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

export function buildPaymentLifecycleSnapshot({
  status,
  effectiveDueDate,
  hasDetectedTransaction = false,
  hasConfirmedLedgerEntry = false,
  hasDuplicateCandidate = false,
  today,
}: PaymentLifecycleSnapshotInput): PaymentLifecycleSnapshot {
  const normalizedStatus = String(status || '').toLowerCase()
  const dueDate = dateOnly(effectiveDueDate)
  const comparisonDate = dateOnly(today || new Date().toISOString().slice(0, 10))
  const daysFromDueDate =
    dueDate && comparisonDate ? daysBetween(comparisonDate, dueDate) : null
  const reasons: string[] = []
  let state: PaymentTimelineState = 'expected'

  if (normalizedStatus === 'cancelled' || normalizedStatus === 'canceled') {
    state = 'cancelled'
    reasons.push('Payment status is cancelled.')
  } else if (hasDuplicateCandidate) {
    state = 'duplicate'
    reasons.push('A duplicate transaction candidate exists for this payment.')
  } else if (
    hasConfirmedLedgerEntry ||
    CLOSED_PAYMENT_STATUSES.includes(normalizedStatus as PaymentStatus)
  ) {
    state = 'closed'
    reasons.push('Payment is confirmed in the ledger or explicitly confirmed.')
  } else if (daysFromDueDate !== null && daysFromDueDate > 0) {
    state = 'overdue'
    reasons.push('Payment due date passed without a confirmed payment.')
    if (hasDetectedTransaction) {
      reasons.push('A possible matching transaction exists but is not confirmed.')
    }
  } else if (hasDetectedTransaction) {
    state = 'detected'
    reasons.push('A matching transaction has been detected.')
  } else if (normalizedStatus === 'initiated') {
    state = 'initiated'
    reasons.push('Payment has been initiated but not confirmed.')
  } else {
    reasons.push('Payment is expected and still open.')
  }

  return {
    state,
    label: labelForTimelineState(state),
    isOpen: !['closed', 'cancelled', 'duplicate'].includes(state),
    isLate: ['overdue', 'late', 'missed'].includes(state),
    isTerminal: ['closed', 'cancelled'].includes(state),
    daysFromDueDate,
    reasons,
  }
}

function dateParts(value: string | null | undefined) {
  if (!value) return { month: null, year: null }

  const [year, month] = value.slice(0, 10).split('-').map(Number)

  return {
    month: Number.isFinite(month) ? month : null,
    year: Number.isFinite(year) ? year : null,
  }
}

function obligationStatusForLifecycle(instance: EnrichedObligationInstance) {
  const status = String(instance.status || '').toLowerCase()

  if (status === 'cancelled' || status === 'canceled') return 'cancelled'
  if (status === 'closed' || status === 'confirmed') return status
  if (status === 'initiated') return 'initiated'

  return 'pending'
}

function obligationLifecycleReasons(instance: EnrichedObligationInstance) {
  const reasons: string[] = []

  if (instance.isEstimated) {
    reasons.push('Obligation amount is estimated.')
  }

  if (instance.isInGracePeriod) {
    reasons.push('Obligation is inside its grace period.')
  }

  if (instance.provider) {
    reasons.push(`Current provider is ${instance.provider.provider_name}.`)
  }

  return reasons
}

function compactNotes(...notes: Array<string | null | undefined>) {
  const parts = notes
    .map((note) => String(note || '').trim())
    .filter(Boolean)

  return parts.length ? parts.join(' | ') : null
}

function friendlyObligationNotes(instance: EnrichedObligationInstance) {
  const description = String(instance.obligation.description || '').trim()

  return description || null
}

function legacySourceIdsFromText(value: string | null | undefined) {
  const text = String(value || '')
  const matches = text.matchAll(
    /\b(?:scheduled_payments|liabilities)\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
  )

  return Array.from(new Set(Array.from(matches, (match) => match[0])))
}

export function obligationInstanceToLifecyclePayment(
  instance: EnrichedObligationInstance,
  today?: string
): PaymentInstance {
  const { month, year } = dateParts(instance.expected_date)
  const notes = compactNotes(instance.notes, instance.obligation.notes)
  const snapshot = buildPaymentLifecycleSnapshot({
    status: obligationStatusForLifecycle(instance),
    effectiveDueDate: instance.effective_due_date,
    today,
  })
  const extraReasons = obligationLifecycleReasons(instance)

  return {
    id: `obligation:${instance.id}`,
    name: instance.obligation.name,
    amount: Number(
      instance.amount_expected ?? instance.obligation.default_amount ?? 0
    ),
    status: obligationStatusForLifecycle(instance),
    owner: instance.obligation.owner,
    due_date: instance.expected_date,
    expected_date: instance.expected_date,
    effective_due_date: instance.effective_due_date,
    grace_until: instance.effective_due_date,
    grace_days: instance.obligation.grace_period_days || 0,
    grace_due_date: instance.effective_due_date,
    updated_at: instance.updated_at,
    notes,
    displayNotes: friendlyObligationNotes(instance),
    payment_month: month,
    payment_year: year,
    scheduled_payment_id: null,
    source: 'obligation',
    lifecycleItemType: 'obligation',
    obligationId: instance.obligation_id,
    obligationInstanceId: instance.id,
    obligationProviderId: instance.provider_id,
    obligationType: instance.obligation.obligation_type,
    obligationCategoryCode: instance.obligation.category_code,
    obligationProviderName: instance.provider?.provider_name || null,
    paymentMethod:
      instance.provider?.payment_method ||
      instance.obligation.payment_method ||
      null,
    legacySourceIds: legacySourceIdsFromText(notes),
    isEstimated: instance.isEstimated,
    isInGracePeriod: instance.isInGracePeriod,
    lifecycleState: snapshot.state,
    lifecycleLabel: snapshot.label,
    lifecycleIsOpen: snapshot.isOpen,
    lifecycleIsClosed: snapshot.state === 'closed',
    isOverdue: snapshot.state === 'overdue',
    daysFromDueDate: snapshot.daysFromDueDate,
    lifecycleReasons: [...snapshot.reasons, ...extraReasons],
    lifecycleReconciliationConfidence: null,
    lifecycleMatchedTransaction: null,
    lifecycleReconciliationReasons:
      snapshot.state === 'overdue'
        ? [
            'No confirmed ledger transaction is linked to this obligation instance.',
          ]
        : [],
  }
}

export async function getObligationLifecyclePaymentItems(
  supabase: FinancialSupabaseClient,
  userId: string,
  options: ObligationLifecyclePaymentOptions = {}
): Promise<PaymentInstance[]> {
  const summary = await getObligationsSummary(supabase, userId, {
    today: options.today,
  })
  const { data: links, error } = await supabase
    .from('obligation_payment_links')
    .select('id, obligation_instance_id, reconciliation_status, confidence, confirmed_at, payment_method, confirmation_note, plaid_imports(id, merchant, amount, transaction_date)')
    .eq('user_id', userId)
    .in('reconciliation_status', ['detected', 'pending_settlement', 'reconciled'])
  if (error) throw error

  const linksByInstance = new Map<string, typeof links>()
  for (const link of links || []) {
    const current = linksByInstance.get(link.obligation_instance_id) || []
    current.push(link)
    linksByInstance.set(link.obligation_instance_id, current)
  }

  return summary.allInstances.map((instance) => {
    const payment = obligationInstanceToLifecyclePayment(instance, summary.asOfDate)
    const instanceLinks = linksByInstance.get(instance.id) || []
    const link = [...instanceLinks].sort((left, right) =>
      (right.reconciliation_status === 'reconciled' ? 3 : right.reconciliation_status === 'pending_settlement' ? 2 : 1) -
      (left.reconciliation_status === 'reconciled' ? 3 : left.reconciliation_status === 'pending_settlement' ? 2 : 1) ||
      Number(right.confidence || 0) - Number(left.confidence || 0)
    )[0]
    if (!link) return payment

    const plaidImport = Array.isArray(link.plaid_imports) ? link.plaid_imports[0] : link.plaid_imports
    const lifecycleState = link.reconciliation_status === 'reconciled'
      ? 'reconciled'
      : link.reconciliation_status === 'pending_settlement'
        ? 'pending_settlement'
        : 'payment_detected'
    return {
      ...payment,
      paymentMethod: link.payment_method || payment.paymentMethod,
      lifecycleState,
      lifecycleLabel: lifecycleState.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      lifecycleIsOpen: lifecycleState !== 'reconciled',
      lifecycleIsClosed: lifecycleState === 'reconciled',
      lifecycleMatchedTransaction: plaidImport ? {
        id: plaidImport.id,
        source: 'plaid_imports',
        name: plaidImport.merchant,
        amount: Number(plaidImport.amount || 0),
        date: plaidImport.transaction_date,
        confidence: Number(link.confidence || 0),
        confidenceLevel: Number(link.confidence || 0) >= 90 ? 'high' : Number(link.confidence || 0) >= 70 ? 'likely' : 'possible',
      } : null,
      lifecycleReconciliationConfidence: Number(link.confidence || 0) || null,
      lifecycleReconciliationReasons: link.confirmation_note ? [link.confirmation_note] : payment.lifecycleReconciliationReasons,
    }
  })
}
