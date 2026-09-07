export type ObligationConfigurationIssueCode =
  | 'amount'
  | 'due_day'
  | 'owner'
  | 'recurrence'
  | 'payment_account'
  | 'due_day_conflict'
  | 'instances'
  | 'anchor_date'

export type ObligationConfigurationIssue = {
  code: ObligationConfigurationIssueCode
  label: string
  explanation: string
}

export type ObligationConfigurationItem = {
  id: string
  source: 'obligation' | 'scheduled_payment'
  name: string
  amount: number | null
  dueDay: number | null
  owner: string | null
  recurrence: string | null
  recurrenceInterval: number | null
  anchorDate: string | null
  paymentMethod: string | null
  householdId: string
  issues: ObligationConfigurationIssue[]
  canConfigurePaymentAccount: boolean
  requiresDueDayConfirmation: boolean
}

type CanonicalObligationRow = {
  id: string
  name: string
  household_id: string
  default_amount?: number | string | null
  amount?: number | string | null
  due_day?: number | null
  owner?: string | null
  frequency?: string | null
  recurrence?: string | null
  payment_method?: string | null
  due_date?: string | null
  notes?: string | null
  is_active?: boolean | null
}

type ScheduledPaymentRow = {
  id: string
  name: string
  household_id: string
  amount?: number | string | null
  due_day?: number | null
  owner?: string | null
  recurrence_type?: string | null
  recurrence_interval?: number | null
  is_active?: boolean | null
  notes?: string | null
  custom_schedule_notes?: string | null
}

type PlanningItemRow = {
  id: string
  name: string
  household_id: string
  target_amount?: number | string | null
  due_date?: string | null
  is_archived?: boolean | null
}

type ObligationInstanceRow = {
  obligation_id: string
  status?: string | null
  expected_date?: string | null
}

const OWNER_VALUES = new Set(['manuel', 'soraya', 'household'])
const RECURRENCE_VALUES = new Set([
  'monthly',
  'quarterly',
  'every_3_months',
  'annual',
  'yearly',
  'one_time',
  'custom',
  'biweekly',
])

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function positiveAmount(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

function validDay(value: unknown) {
  const day = Number(value)
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null
}

function validOwner(value: unknown) {
  const owner = text(value)
  return owner && OWNER_VALUES.has(owner.toLowerCase()) ? owner : null
}

function validRecurrence(value: unknown, interval: unknown) {
  const recurrence = text(value)?.toLowerCase() || null
  if (!recurrence || !RECURRENCE_VALUES.has(recurrence)) return null
  if (recurrence === 'custom' && !(Number(interval) > 0)) return null
  return recurrence
}

function issue(
  code: ObligationConfigurationIssueCode,
  label: string,
  explanation: string
): ObligationConfigurationIssue {
  return { code, label, explanation }
}

function canonicalItem(
  row: CanonicalObligationRow,
  obligationInstances: ObligationInstanceRow[],
  extraIssues: ObligationConfigurationIssue[] = []
): ObligationConfigurationItem {
  const amount = positiveAmount(row.default_amount ?? row.amount)
  const dueDay = validDay(row.due_day)
  const owner = validOwner(row.owner)
  const recurrence = validRecurrence(row.frequency || row.recurrence, 1)
  const anchorDate = obligationInstances
    .filter((instance) => instance.obligation_id === row.id && instance.expected_date)
    .map((instance) => instance.expected_date!.slice(0, 10))
    .sort()[0] || row.due_date?.slice(0, 10) || null
  const paymentMethod = text(row.payment_method)
  const issues: ObligationConfigurationIssue[] = [...extraIssues]

  if (!amount) issues.push(issue('amount', 'Monto esperado', 'Falta un importe positivo para proyectar la obligación.'))
  if (!dueDay && recurrence !== 'one_time' && recurrence !== 'biweekly') issues.push(issue('due_day', 'Día de vencimiento', 'Sin un día de vencimiento no se puede ubicar el próximo ciclo.'))
  if (recurrence === 'biweekly' && !anchorDate) issues.push(issue('anchor_date', 'Fecha ancla', 'La recurrencia cada 14 días requiere una fecha contractual completa.'))
  if (!owner) issues.push(issue('owner', 'Responsable', 'Selecciona Manuel, Soraya o el hogar.'))
  if (!recurrence) issues.push(issue('recurrence', 'Recurrencia', 'La frecuencia no permite calcular el siguiente ciclo.'))
  if (!paymentMethod) issues.push(issue('payment_account', 'Cuenta habitual', 'Indica la cuenta o método que normalmente paga esta obligación.'))

  return {
    id: row.id,
    source: 'obligation',
    name: row.name,
    amount,
    dueDay,
    owner,
    recurrence,
    recurrenceInterval: 1,
    anchorDate,
    paymentMethod,
    householdId: row.household_id,
    issues,
    canConfigurePaymentAccount: true,
    requiresDueDayConfirmation: issues.some(
      (item) => item.code === 'due_day_conflict'
    ),
  }
}

function scheduledItem(row: ScheduledPaymentRow): ObligationConfigurationItem {
  const amount = positiveAmount(row.amount)
  const dueDay = validDay(row.due_day)
  const owner = validOwner(row.owner)
  const recurrence = validRecurrence(row.recurrence_type, row.recurrence_interval)
  const anchorDate = String(row.custom_schedule_notes || '').match(/anchor_date:(\d{4}-\d{2}-\d{2})/i)?.[1] || null
  const issues: ObligationConfigurationIssue[] = []

  if (!amount) issues.push(issue('amount', 'Monto esperado', 'Falta un importe positivo para proyectar este calendario legacy.'))
  if (!dueDay && recurrence !== 'one_time' && recurrence !== 'biweekly') issues.push(issue('due_day', 'Día de vencimiento', 'Sin un día de vencimiento no se generan ocurrencias.'))
  if (recurrence === 'biweekly' && !anchorDate) issues.push(issue('anchor_date', 'Fecha ancla', 'La recurrencia cada 14 días requiere una fecha contractual completa.'))
  if (!owner) issues.push(issue('owner', 'Responsable', 'Selecciona Manuel, Soraya o el hogar.'))
  if (!recurrence) issues.push(issue('recurrence', 'Recurrencia', 'La recurrencia legacy está ausente o no es suficiente.'))

  return {
    id: row.id,
    source: 'scheduled_payment',
    name: row.name,
    amount,
    dueDay,
    owner,
    recurrence,
    recurrenceInterval: Number(row.recurrence_interval || 1),
    anchorDate,
    paymentMethod: null,
    householdId: row.household_id,
    issues,
    canConfigurePaymentAccount: false,
    requiresDueDayConfirmation: false,
  }
}

function normalizedIdentityName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+-\s+(manuel|soraya|household|hogar)$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function linkedLegacyScheduleId(notes: string | null | undefined) {
  return String(notes || '').match(
    /scheduled_payments\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  )?.[1] || null
}

function hasConfirmedContractualDay(row: CanonicalObligationRow) {
  return new RegExp(`contractual_due_day_confirmed:${row.due_day}(?:\\b|$)`, 'i')
    .test(String(row.notes || ''))
}

function canonicalParityIssues({
  row,
  scheduledPayments,
  planningItems,
  obligationInstances,
}: {
  row: CanonicalObligationRow
  scheduledPayments: ScheduledPaymentRow[]
  planningItems: PlanningItemRow[]
  obligationInstances: ObligationInstanceRow[]
}) {
  const issues: ObligationConfigurationIssue[] = []
  const sourceId = linkedLegacyScheduleId(row.notes)
  const legacy = sourceId
    ? scheduledPayments.find((item) => item.id === sourceId)
    : null
  const normalizedName = normalizedIdentityName(row.name)
  const planning = planningItems.find((item) =>
    item.household_id === row.household_id &&
    normalizedIdentityName(item.name) === normalizedName &&
    Number(item.target_amount || 0) === Number(row.default_amount ?? row.amount ?? 0)
  )
  const planningDueDay = planning?.due_date
    ? Number(planning.due_date.slice(8, 10))
    : null
  const legacyDueDay = legacy?.due_day ?? null
  const recurrence = validRecurrence(row.frequency || row.recurrence, 1)
  const hasConflict = Boolean(
    recurrence !== 'biweekly' &&
    !hasConfirmedContractualDay(row) &&
    ((legacy && (!legacyDueDay || legacyDueDay !== row.due_day)) ||
      (planningDueDay && planningDueDay !== row.due_day))
  )

  if (hasConflict) {
    const sourceDay = legacy
      ? legacyDueDay || 'no configurado'
      : planningDueDay
    issues.push(issue(
      'due_day_conflict',
      'Conflicto de día contractual',
      `La fuente anterior indica ${sourceDay} y la obligación canónica indica ${row.due_day || 'no configurado'}. Confirma explícitamente el día correcto; no se generarán ciclos mientras exista el conflicto.`
    ))
  }

  if (!obligationInstances.some((instance) => instance.obligation_id === row.id)) {
    issues.push(issue(
      'instances',
      'Sin ciclo canónico inicial',
      'La obligación no tiene una instancia confirmada desde la cual proyectar los próximos ciclos.'
    ))
  }

  return issues
}

export function buildObligationConfigurationReport({
  obligations,
  scheduledPayments,
  planningItems = [],
  obligationInstances = [],
}: {
  obligations: CanonicalObligationRow[]
  scheduledPayments: ScheduledPaymentRow[]
  planningItems?: PlanningItemRow[]
  obligationInstances?: ObligationInstanceRow[]
}) {
  const canonical = obligations
    .filter((row) => row.is_active !== false)
    .map((row) => canonicalItem(row, obligationInstances, canonicalParityIssues({
      row,
      scheduledPayments,
      planningItems,
      obligationInstances,
    })))
  const canonicalNames = new Set(canonical.map((row) => row.name.trim().toLowerCase()))
  const legacy = scheduledPayments
    .filter((row) => row.is_active !== false)
    .filter((row) => !String(row.notes || '').includes('migrated_to_obligation.'))
    .filter((row) => !canonicalNames.has(row.name.trim().toLowerCase()))
    .map(scheduledItem)
  const all = [...canonical, ...legacy]
  const needsConfiguration = all
    .filter((row) => row.issues.length > 0)
    .sort((left, right) => right.issues.length - left.issues.length || left.name.localeCompare(right.name))

  return {
    all,
    needsConfiguration,
    complete: all.filter((row) => row.issues.length === 0),
  }
}
