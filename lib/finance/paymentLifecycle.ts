import {
  getObligationsSummary,
  type EnrichedObligationInstance,
} from '../financial-engine/obligations.ts'
import type {
  FinancialSupabaseClient,
  PaymentInstance,
} from '../financial-engine/types.ts'
import {
  addCalendarDays,
  enumerateRecurringCycles,
} from '../financial-engine/recurring-cycle-enumerator.ts'

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
  horizonEnd?: string
}

export type PaymentStateSemantics = {
  settlementState: string
  userActionRequired: boolean
  countsAsUnpaidRisk: boolean
  bankConfirmationPending: boolean
}

export function derivePaymentStateSemantics({
  lifecycleState,
  status,
}: Pick<PaymentInstance, 'lifecycleState' | 'status'>): PaymentStateSemantics {
  const state = String(lifecycleState || status || 'unpaid').toLowerCase()

  if (state === 'pending_settlement') {
    return {
      settlementState: 'pending_settlement',
      userActionRequired: false,
      countsAsUnpaidRisk: false,
      bankConfirmationPending: true,
    }
  }

  if (['reconciled', 'closed', 'paid', 'confirmed'].includes(state)) {
    return {
      settlementState: 'reconciled',
      userActionRequired: false,
      countsAsUnpaidRisk: false,
      bankConfirmationPending: false,
    }
  }

  if (['cancelled', 'canceled', 'duplicate'].includes(state)) {
    return {
      settlementState: state === 'canceled' ? 'cancelled' : state,
      userActionRequired: false,
      countsAsUnpaidRisk: false,
      bankConfirmationPending: false,
    }
  }

  return {
    settlementState: state,
    userActionRequired: true,
    countsAsUnpaidRisk: true,
    bankConfirmationPending: false,
  }
}

export function paymentRequiresUserAction(payment: PaymentInstance) {
  if (payment.userActionRequired !== undefined) return payment.userActionRequired
  if (payment.lifecycleIsClosed || payment.lifecycleIsOpen === false) return false

  return derivePaymentStateSemantics(payment).userActionRequired
}

export function paymentCountsAsUnpaidRisk(payment: PaymentInstance) {
  if (payment.countsAsUnpaidRisk !== undefined) return payment.countsAsUnpaidRisk
  if (payment.lifecycleIsClosed || payment.lifecycleIsOpen === false) return false

  return derivePaymentStateSemantics(payment).countsAsUnpaidRisk
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
  return ({ expected: 'Programado', detected: 'Posible pago detectado', initiated: 'Pago reportado', closed: 'Conciliado', cancelled: 'Cancelado', duplicate: 'Posible duplicado', overdue: 'Vencido', late: 'Atrasado', missed: 'Pago omitido' } as Record<PaymentTimelineState, string>)[state]
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
    reasons.push('El pago está cancelado.')
  } else if (hasDuplicateCandidate) {
    state = 'duplicate'
    reasons.push('Existe una posible transacción duplicada para este pago.')
  } else if (
    hasConfirmedLedgerEntry ||
    CLOSED_PAYMENT_STATUSES.includes(normalizedStatus as PaymentStatus)
  ) {
    state = 'closed'
    reasons.push('El pago está confirmado en el historial o fue confirmado explícitamente.')
  } else if (daysFromDueDate !== null && daysFromDueDate > 0) {
    state = 'overdue'
    reasons.push('La fecha de vencimiento pasó sin un pago confirmado.')
    if (hasDetectedTransaction) {
      reasons.push('Existe una posible transacción coincidente, pero todavía no está confirmada.')
    }
  } else if (hasDetectedTransaction) {
    state = 'detected'
    reasons.push('Se detectó una transacción que podría corresponder a este pago.')
  } else if (normalizedStatus === 'initiated') {
    state = 'initiated'
    reasons.push('El pago fue reportado, pero todavía no está confirmado.')
  } else {
    reasons.push('El pago está programado y continúa abierto.')
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
    reasons.push('El monto de la obligación es estimado.')
  }

  if (instance.isInGracePeriod) {
    reasons.push('La obligación está dentro de su período de gracia.')
  }

  if (instance.provider) {
    reasons.push(`El proveedor actual es ${instance.provider.provider_name}.`)
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

function legacyActiveMonths(notes: string | null | undefined) {
  const match = String(notes || '').match(/Legacy active_months:([0-9,]+)/i)
  return match?.[1] || null
}

export function projectedCanonicalInstances(
  summary: Awaited<ReturnType<typeof getObligationsSummary>>,
  horizonEnd: string | undefined
): EnrichedObligationInstance[] {
  if (!horizonEnd) return []
  const projected: EnrichedObligationInstance[] = []

  for (const profile of summary.active) {
    // The first canonical instance is the explicit configuration boundary.
    // Masters with no confirmed starting cycle stay in Needs Configuration.
    if (
      !profile.instances.length ||
      (!profile.due_day && profile.frequency !== 'biweekly') ||
      !profile.default_amount
    ) {
      continue
    }

    const existingCycles = profile.instances.map((instance) => ({
      dueDate: instance.expected_date,
    }))
    const firstInstance = [...profile.instances].sort((left, right) =>
      left.expected_date.localeCompare(right.expected_date)
    )[0]
    const cycles = enumerateRecurringCycles({
      source: {
        id: profile.id,
        due_day: profile.due_day,
        is_active: profile.is_active,
        recurrence_type: profile.frequency,
        recurrence_interval:
          profile.frequency === 'quarterly' || profile.frequency === 'every_3_months'
            ? 3
            : profile.frequency === 'annual' || profile.frequency === 'yearly'
              ? 12
              : 1,
        active_months: legacyActiveMonths(profile.notes),
        start_date: firstInstance.expected_date,
      },
      startDate: summary.asOfDate,
      horizonEnd,
      existingCycles,
    })

    for (const cycle of cycles) {
      const effectiveDueDate = addCalendarDays(
        cycle.dueDate,
        Number(profile.grace_period_days || 0)
      )
      projected.push({
        id: `projected:${profile.id}:${cycle.dueDate}`,
        user_id: profile.user_id,
        obligation_id: profile.id,
        provider_id: profile.currentProvider?.id || null,
        expected_date: cycle.dueDate,
        effective_due_date: effectiveDueDate,
        amount_expected: profile.default_amount,
        amount_is_estimated: profile.amount_is_estimated,
        status: 'pending',
        source: 'projected',
        notes: profile.notes,
        created_at: null,
        updated_at: null,
        obligation: profile,
        provider: profile.currentProvider,
        providers: profile.providers,
        isCompleted: false,
        isOverdue: effectiveDueDate < summary.asOfDate,
        isInGracePeriod:
          cycle.dueDate < summary.asOfDate &&
          effectiveDueDate >= summary.asOfDate,
        isEstimated: profile.amount_is_estimated,
        daysFromEffectiveDueDate: null,
      })
    }
  }

  return projected
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
  const semantics = derivePaymentStateSemantics({
    lifecycleState: snapshot.state,
    status: obligationStatusForLifecycle(instance),
  })

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
    ...semantics,
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
    .select('id, obligation_instance_id, reconciliation_status, confidence, reported_amount, confirmed_at, payment_method, confirmation_note, plaid_imports(id, merchant, amount, transaction_date)')
    .eq('user_id', userId)
    .in('reconciliation_status', ['detected', 'pending_settlement', 'reconciled'])
  if (error) throw error

  const linksByInstance = new Map<string, typeof links>()
  for (const link of links || []) {
    const current = linksByInstance.get(link.obligation_instance_id) || []
    current.push(link)
    linksByInstance.set(link.obligation_instance_id, current)
  }

  const lifecycleInstances = [
    ...summary.allInstances,
    ...projectedCanonicalInstances(summary, options.horizonEnd),
  ]

  return lifecycleInstances.map((instance) => {
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
    const semantics = derivePaymentStateSemantics({
      lifecycleState,
      status: payment.status,
    })
    return {
      ...payment,
      amount: link.reported_amount === null
        ? payment.amount
        : Number(link.reported_amount),
      paymentMethod: link.payment_method || payment.paymentMethod,
      lifecycleState,
      lifecycleLabel: lifecycleState.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      ...semantics,
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
