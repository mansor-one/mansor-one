import type { IncomeSchedule, PaymentInstance } from './types'

export const DEFAULT_PLANNING_HORIZON_DAYS = 45
export const DUE_SOON_DAYS = 7
export const IN_TRANSIT_BUSINESS_DAYS = 3

export type PaymentTruthStatus =
  | 'paid'
  | 'matched'
  | 'possible_match'
  | 'in_transit'
  | 'unpaid'
  | 'due_soon'
  | 'due_today'
  | 'grace_period'
  | 'overdue'
  | 'needs_review'
  | 'incomplete'
  | 'future'

export type TrustedPayment = PaymentInstance & {
  truthStatus: PaymentTruthStatus
  truthReasons: string[]
  actionable: boolean
  duplicate: boolean
  sourceOfTruth: string
  availableAction: string
}

export type ExpectedIncomeInstance = {
  id: string
  scheduleId: string
  name: string
  amount: number
  date: string
  owner: string
  destination: string | null
  confidence: string
  projected: boolean
}

function dateOnly(value: Date | string) {
  const date = value instanceof Date ? new Date(value) : new Date(`${value.slice(0, 10)}T00:00:00`)
  date.setHours(0, 0, 0, 0)
  return date
}

export function isoDate(value: Date | string) {
  return dateOnly(value).toISOString().slice(0, 10)
}

export function addDays(value: Date | string, days: number) {
  const date = dateOnly(value)
  date.setDate(date.getDate() + days)
  return isoDate(date)
}

function daysBetween(left: string, right: string) {
  return Math.round((dateOnly(left).getTime() - dateOnly(right).getTime()) / 86_400_000)
}

export function businessDaysBetween(left: string, right: string) {
  const start = dateOnly(left)
  const end = dateOnly(right)
  if (start > end) return businessDaysBetween(right, left)

  let days = 0
  const cursor = new Date(start)
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1)
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) days += 1
  }
  return days
}

function normalized(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function paymentDate(payment: PaymentInstance) {
  return payment.due_date || payment.expected_date || payment.effective_due_date || null
}

function graceDate(payment: PaymentInstance) {
  return payment.grace_until || payment.grace_due_date || payment.effective_due_date || paymentDate(payment)
}

function duplicateKey(payment: PaymentInstance) {
  const date = paymentDate(payment) || 'missing'
  const amount = Math.round(Number(payment.amount || 0) * 100)
  return `${normalized(payment.name)}|${amount}|${date}`
}

export function resolveTrustedPayments({
  payments,
  today,
  horizonDays = DEFAULT_PLANNING_HORIZON_DAYS,
  dueSoonDays = DUE_SOON_DAYS,
}: {
  payments: PaymentInstance[]
  today: string
  horizonDays?: number
  dueSoonDays?: number
}): TrustedPayment[] {
  const horizonEnd = addDays(today, horizonDays)
  const duplicateCounts = new Map<string, number>()
  const transactionCandidateCounts = new Map<string, number>()
  payments.forEach((payment) => {
    const key = duplicateKey(payment)
    duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1)
    const transactionId = payment.lifecycleMatchedTransaction?.id
    if (transactionId && Number(payment.lifecycleMatchedTransaction?.confidence || 0) >= 50) {
      transactionCandidateCounts.set(transactionId, (transactionCandidateCounts.get(transactionId) || 0) + 1)
    }
  })

  return payments.map((payment) => {
    const amount = Number(payment.amount || 0)
    const dueDate = paymentDate(payment)
    const effectiveGraceDate = graceDate(payment)
    const rawStatus = normalized(payment.status)
    const duplicate = (duplicateCounts.get(duplicateKey(payment)) || 0) > 1
    const match = payment.lifecycleMatchedTransaction
    const confirmedMatch = match?.source === 'quick_entries' &&
      Number(match.confidence || 0) >= 70 &&
      (transactionCandidateCounts.get(match.id) || 0) === 1
    const possibleMatch = Boolean(match && !confirmedMatch && Number(match.confidence || 0) >= 50)
    const transitEvidenceDate = match?.date || payment.updated_at?.slice(0, 10) || null
    const recentInitiatedPayment =
      rawStatus === 'initiated' &&
      Boolean(transitEvidenceDate) &&
      businessDaysBetween(transitEvidenceDate as string, today) <= IN_TRANSIT_BUSINESS_DAYS
    const reasons: string[] = []
    let truthStatus: PaymentTruthStatus

    if (!Number.isFinite(amount) || amount <= 0 || !dueDate) {
      truthStatus = 'incomplete'
      if (!(amount > 0)) reasons.push('El monto falta, no es válido o es cero.')
      if (!dueDate) reasons.push('Falta la fecha de vencimiento.')
    } else if (duplicate) {
      truthStatus = 'needs_review'
      reasons.push('Otra obligación tiene el mismo nombre normalizado, monto y fecha de vencimiento.')
    } else if (['paid', 'confirmed', 'closed'].includes(rawStatus) || payment.lifecycleIsClosed || payment.lifecycleState === 'reconciled') {
      truthStatus = 'paid'
      reasons.push('El pago fue cerrado explícitamente.')
    } else if (confirmedMatch) {
      truthStatus = 'matched'
      reasons.push('Una transacción única del historial confirmado cumple el umbral de coincidencia confiable.')
    } else if (payment.lifecycleState === 'pending_settlement' || recentInitiatedPayment) {
      truthStatus = 'in_transit'
      reasons.push(`El pago fue reportado en los últimos ${IN_TRANSIT_BUSINESS_DAYS} días laborables y está esperando confirmación bancaria.`)
    } else if (payment.lifecycleState === 'payment_detected' || possibleMatch) {
      truthStatus = 'possible_match'
      reasons.push('Encontramos una posible transacción, pero todavía debes confirmarla.')
    } else if (dueDate > horizonEnd) {
      truthStatus = 'future'
      reasons.push(`Está programado después del horizonte actual, que termina el ${horizonEnd}.`)
    } else if (effectiveGraceDate && effectiveGraceDate < today) {
      truthStatus = 'overdue'
      reasons.push('La fecha de vencimiento y el período de gracia ya pasaron sin un pago confirmado.')
    } else if (dueDate < today && effectiveGraceDate && effectiveGraceDate >= today) {
      truthStatus = 'grace_period'
      reasons.push('La fecha de vencimiento pasó, pero el pago todavía está dentro del período de gracia.')
    } else if (dueDate === today) {
      truthStatus = 'due_today'
      reasons.push('Vence hoy.')
    } else if (daysBetween(dueDate, today) <= dueSoonDays) {
      truthStatus = 'due_soon'
      reasons.push(`Vence dentro de los próximos ${dueSoonDays} días.`)
    } else {
      truthStatus = 'unpaid'
      reasons.push('Está dentro del horizonte activo, pero todavía no requiere acción.')
    }

    const actionable = [
      'possible_match',
      'due_soon',
      'due_today',
      'grace_period',
      'overdue',
      'needs_review',
    ].includes(truthStatus)

    return {
      ...payment,
      truthStatus,
      truthReasons: reasons,
      actionable,
      duplicate,
      sourceOfTruth:
        payment.source === 'obligation'
          ? 'instancia de obligación'
          : payment.source === 'scheduled_payment'
            ? 'ocurrencia generada del calendario'
            : 'instancia de pago',
      availableAction:
        truthStatus === 'possible_match' || truthStatus === 'needs_review'
          ? 'Revisar transacción'
          : truthStatus === 'paid' || truthStatus === 'matched'
            ? 'Reabrir pago'
            : truthStatus === 'in_transit'
              ? 'Esperar confirmación bancaria'
            : 'Marcar como pagado',
    }
  })
}

function advanceIncomeDate(dateString: string, cadence: string) {
  const date = dateOnly(dateString)
  if (cadence === 'weekly') date.setDate(date.getDate() + 7)
  else if (cadence === 'biweekly') date.setDate(date.getDate() + 14)
  else if (cadence === 'monthly') date.setMonth(date.getMonth() + 1)
  else return null
  return isoDate(date)
}

export function generateExpectedIncomeInstances({
  schedules,
  start,
  end,
}: {
  schedules: IncomeSchedule[]
  start: string
  end: string
}) {
  const instances: ExpectedIncomeInstance[] = []
  const incompleteSchedules: IncomeSchedule[] = []

  schedules.filter((schedule) => schedule.is_active !== false).forEach((schedule) => {
    const amount = Number(schedule.amount || 0)
    const firstDate = schedule.next_expected_date
    const cadence = schedule.cadence || 'one_time'
    if (!(amount > 0) || !firstDate || !['one_time', 'weekly', 'biweekly', 'monthly'].includes(cadence)) {
      incompleteSchedules.push(schedule)
      return
    }

    let cursor: string | null = firstDate
    let guard = 0
    while (cursor && cursor < start && guard++ < 400) cursor = advanceIncomeDate(cursor, cadence)
    while (cursor && cursor <= end && guard++ < 400) {
      instances.push({
        id: `income:${schedule.id || normalized(schedule.name)}:${cursor}`,
        scheduleId: schedule.id || normalized(schedule.name),
        name: schedule.name || 'Income',
        amount,
        date: cursor,
        owner: schedule.owner || schedule.owner_scope || 'household',
        destination: schedule.destination_account_id || null,
        confidence: schedule.confidence || 'estimated',
        projected: schedule.status !== 'received',
      })
      cursor = advanceIncomeDate(cursor, cadence)
    }
  })

  return {
    instances: instances.sort((a, b) => a.date.localeCompare(b.date)),
    incompleteSchedules,
  }
}

export function threePaycheckMonths(instances: ExpectedIncomeInstance[]) {
  const counts = new Map<string, { owner: string; month: string; count: number }>()
  instances.forEach((instance) => {
    const month = instance.date.slice(0, 7)
    const key = `${normalized(instance.owner)}|${month}`
    const current = counts.get(key) || { owner: instance.owner, month, count: 0 }
    current.count += 1
    counts.set(key, current)
  })
  return Array.from(counts.values()).filter((item) => item.count >= 3)
}
