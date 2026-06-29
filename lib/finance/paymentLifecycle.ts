export const PAYMENT_LIFECYCLE_STATES = [
  'pending',
  'initiated',
  'confirmed',
] as const

export type PaymentLifecycleState = (typeof PAYMENT_LIFECYCLE_STATES)[number]

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
