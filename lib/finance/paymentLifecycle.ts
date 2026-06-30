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
  'missed',
  'late',
  'duplicate',
  'cancelled',
] as const

export type PaymentTimelineState = (typeof PAYMENT_TIMELINE_STATES)[number]

export const LEGACY_PAYMENT_STATUSES = ['promise', 'paid'] as const

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
    reasons.push('Payment is confirmed in the ledger or marked paid.')
  } else if (hasDetectedTransaction) {
    state = 'detected'
    reasons.push('A matching transaction has been detected.')
  } else if (normalizedStatus === 'initiated') {
    state = 'initiated'
    reasons.push('Payment has been initiated but not confirmed.')
  } else if (daysFromDueDate !== null && daysFromDueDate > 3) {
    state = 'missed'
    reasons.push('Payment due date passed without a detected transaction.')
  } else if (daysFromDueDate !== null && daysFromDueDate > 0) {
    state = 'late'
    reasons.push('Payment is past due and still open.')
  } else {
    reasons.push('Payment is expected and still open.')
  }

  return {
    state,
    label: labelForTimelineState(state),
    isOpen: !['closed', 'cancelled', 'duplicate'].includes(state),
    isLate: state === 'late' || state === 'missed',
    isTerminal: ['closed', 'cancelled'].includes(state),
    daysFromDueDate,
    reasons,
  }
}
