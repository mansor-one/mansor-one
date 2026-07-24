import type { FinancialSupabaseClient } from './types'

export type ObligationStatus =
  | 'pending'
  | 'initiated'
  | 'confirmed'
  | 'closed'
  | 'skipped'
  | 'cancelled'

export type ObligationProvider = {
  id: string
  user_id: string
  obligation_id: string
  provider_name: string
  phone: string | null
  payment_method: string | null
  active_from: string | null
  active_until: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export type Obligation = {
  id: string
  user_id: string
  name: string
  description: string | null
  category_code: string | null
  owner: string
  obligation_type: string
  default_amount: number | null
  amount_is_estimated: boolean
  frequency: string
  due_day: number | null
  grace_period_days: number
  payment_method: string | null
  is_active: boolean
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export type ObligationInstance = {
  id: string
  user_id: string
  obligation_id: string
  provider_id: string | null
  expected_date: string
  effective_due_date: string
  amount_expected: number | null
  amount_is_estimated: boolean
  status: ObligationStatus | string
  source: string
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export type ObligationProfile = Obligation & {
  providers: ObligationProvider[]
  currentProvider: ObligationProvider | null
  instances: ObligationInstance[]
}

export type EnrichedObligationInstance = ObligationInstance & {
  obligation: Obligation
  provider: ObligationProvider | null
  providers: ObligationProvider[]
  isCompleted: boolean
  isOverdue: boolean
  isInGracePeriod: boolean
  isEstimated: boolean
  daysFromEffectiveDueDate: number | null
}

export type ObligationsSummary = {
  asOfDate: string
  active: ObligationProfile[]
  upcoming: EnrichedObligationInstance[]
  overdue: EnrichedObligationInstance[]
  gracePeriod: EnrichedObligationInstance[]
  estimated: EnrichedObligationInstance[]
  completed: EnrichedObligationInstance[]
  allInstances: EnrichedObligationInstance[]
}

export type GetObligationsSummaryOptions = {
  today?: string
}

const COMPLETED_STATUSES = new Set(['confirmed', 'closed'])

function dateOnly(value: string | null | undefined) {
  if (!value) return null
  return value.slice(0, 10)
}

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(left: string, right: string) {
  const leftDate = new Date(`${left}T00:00:00`)
  const rightDate = new Date(`${right}T00:00:00`)

  if (!Number.isFinite(leftDate.getTime()) || !Number.isFinite(rightDate.getTime())) {
    return null
  }

  return Math.round(
    (leftDate.getTime() - rightDate.getTime()) / (24 * 60 * 60 * 1000)
  )
}

function normalizeStatus(status: string | null | undefined) {
  return String(status || '').toLowerCase()
}

function sortByDateThenName(
  left: EnrichedObligationInstance,
  right: EnrichedObligationInstance
) {
  const leftDate = dateOnly(left.effective_due_date) || ''
  const rightDate = dateOnly(right.effective_due_date) || ''

  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate)
  return left.obligation.name.localeCompare(right.obligation.name)
}

function sortProviders(providers: ObligationProvider[]) {
  return [...providers].sort((left, right) => {
    const leftStart = dateOnly(left.active_from) || ''
    const rightStart = dateOnly(right.active_from) || ''

    if (left.active_until && !right.active_until) return 1
    if (!left.active_until && right.active_until) return -1
    if (leftStart !== rightStart) return rightStart.localeCompare(leftStart)
    return left.provider_name.localeCompare(right.provider_name)
  })
}

function getCurrentProvider(
  providers: ObligationProvider[],
  today: string
): ObligationProvider | null {
  const sorted = sortProviders(providers)

  return (
    sorted.find((provider) => {
      const activeFrom = dateOnly(provider.active_from)
      const activeUntil = dateOnly(provider.active_until)
      const startsBeforeToday = !activeFrom || activeFrom <= today
      const endsAfterToday = !activeUntil || activeUntil >= today

      return startsBeforeToday && endsAfterToday
    }) ||
    sorted.find((provider) => !provider.active_until) ||
    sorted[0] ||
    null
  )
}

export async function getObligationsSummary(
  supabase: FinancialSupabaseClient,
  userId: string,
  options: GetObligationsSummaryOptions = {}
): Promise<ObligationsSummary> {
  const asOfDate = dateOnly(options.today) || todayString()

  const [
    { data: obligationsData, error: obligationsError },
    { data: providersData, error: providersError },
    { data: instancesData, error: instancesError },
  ] = await Promise.all([
    supabase
      .from('obligations')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true }),
    supabase
      .from('obligation_providers')
      .select('*')
      .eq('user_id', userId)
      .order('active_from', { ascending: false, nullsFirst: false }),
    supabase
      .from('obligation_instances')
      .select('*')
      .eq('user_id', userId)
      .order('effective_due_date', { ascending: true }),
  ])

  if (obligationsError) throw obligationsError
  if (providersError) throw providersError
  if (instancesError) throw instancesError

  const obligations = (obligationsData || []) as Obligation[]
  const providers = (providersData || []) as ObligationProvider[]
  const instances = (instancesData || []) as ObligationInstance[]
  const obligationsById = new Map(
    obligations.map((obligation) => [obligation.id, obligation])
  )
  const providersByObligationId = new Map<string, ObligationProvider[]>()
  const instancesByObligationId = new Map<string, ObligationInstance[]>()

  for (const provider of providers) {
    const obligationProviders =
      providersByObligationId.get(provider.obligation_id) || []
    obligationProviders.push(provider)
    providersByObligationId.set(provider.obligation_id, obligationProviders)
  }

  for (const instance of instances) {
    const obligationInstances =
      instancesByObligationId.get(instance.obligation_id) || []
    obligationInstances.push(instance)
    instancesByObligationId.set(instance.obligation_id, obligationInstances)
  }

  const active = obligations
    .filter((obligation) => obligation.is_active)
    .map((obligation) => {
      const obligationProviders = sortProviders(
        providersByObligationId.get(obligation.id) || []
      )

      return {
        ...obligation,
        providers: obligationProviders,
        currentProvider: getCurrentProvider(obligationProviders, asOfDate),
        instances: instancesByObligationId.get(obligation.id) || [],
      }
    })

  const enrichedInstances: EnrichedObligationInstance[] = []

  for (const instance of instances) {
    const obligation = obligationsById.get(instance.obligation_id)

    if (!obligation) continue

    const obligationProviders = sortProviders(
      providersByObligationId.get(instance.obligation_id) || []
    )
    const provider =
      obligationProviders.find((item) => item.id === instance.provider_id) ||
      getCurrentProvider(obligationProviders, asOfDate)
    const status = normalizeStatus(instance.status)
    const expectedDate = dateOnly(instance.expected_date)
    const effectiveDueDate = dateOnly(instance.effective_due_date)
    const isCompleted = COMPLETED_STATUSES.has(status)
    const isOverdue =
      !isCompleted &&
      Boolean(effectiveDueDate) &&
      String(effectiveDueDate) < asOfDate
    const isInGracePeriod =
      !isCompleted &&
      !isOverdue &&
      Boolean(expectedDate && effectiveDueDate) &&
      String(expectedDate) < asOfDate &&
      String(effectiveDueDate) >= asOfDate

    enrichedInstances.push({
      ...instance,
      obligation,
      provider,
      providers: obligationProviders,
      isCompleted,
      isOverdue,
      isInGracePeriod,
      isEstimated: obligation.amount_is_estimated || instance.amount_is_estimated,
      daysFromEffectiveDueDate: effectiveDueDate
        ? daysBetween(asOfDate, effectiveDueDate)
        : null,
    })
  }

  const upcoming = enrichedInstances
    .filter((instance) => {
      const expectedDate = dateOnly(instance.expected_date)

      return (
        !instance.isCompleted &&
        !instance.isOverdue &&
        !instance.isInGracePeriod &&
        Boolean(expectedDate) &&
        String(expectedDate) >= asOfDate
      )
    })
    .sort(sortByDateThenName)
  const overdue = enrichedInstances.filter((item) => item.isOverdue)
  const gracePeriod = enrichedInstances.filter((item) => item.isInGracePeriod)
  const estimated = enrichedInstances.filter((item) => item.isEstimated)
  const completed = enrichedInstances.filter((item) => item.isCompleted)

  return {
    asOfDate,
    active,
    upcoming,
    overdue: overdue.sort(sortByDateThenName),
    gracePeriod: gracePeriod.sort(sortByDateThenName),
    estimated: estimated.sort(sortByDateThenName),
    completed: completed.sort(sortByDateThenName),
    allInstances: enrichedInstances.sort(sortByDateThenName),
  }
}
