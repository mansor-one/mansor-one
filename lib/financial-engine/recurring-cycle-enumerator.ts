export type RecurringCycleSource = {
  id: string
  due_day?: number | null
  is_active?: boolean | null
  active_months?: string | null
  recurrence_type?: string | null
  recurrence_interval?: number | null
  created_at?: string | null
  start_date?: string | null
  end_date?: string | null
  anchor_date?: string | null
  due_date?: string | null
  custom_schedule_notes?: string | null
}

export const DEFAULT_HOUSEHOLD_TIME_ZONE = 'America/Puerto_Rico'

export type RecurringCycle = {
  scheduleId: string
  year: number
  month: number
  dueDate: string
}

export function recurrenceAnchorDate(source: RecurringCycleSource) {
  const markedAnchor = String(source.custom_schedule_notes || '').match(
    /(?:^|\|)\s*anchor_date:(\d{4}-\d{2}-\d{2})(?:\s*\||$)/i
  )?.[1]
  const candidate = source.anchor_date || source.start_date || source.due_date || markedAnchor || null
  return candidate && isoParts(candidate) ? candidate.slice(0, 10) : null
}

export function withRecurrenceAnchorMarker(notes: string | null | undefined, anchorDate: string) {
  if (!isoParts(anchorDate)) throw new Error(`Invalid recurrence anchor date: ${anchorDate}`)
  const withoutPrevious = String(notes || '')
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part && !/^anchor_date:/i.test(part))
  return [...withoutPrevious, `anchor_date:${anchorDate.slice(0, 10)}`].join(' | ')
}

function isoParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10))
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) return null
  return { year, month, day }
}

function monthIndex(year: number, month: number) {
  return year * 12 + month - 1
}

function monthFromIndex(index: number) {
  return {
    year: Math.floor(index / 12),
    month: index % 12 + 1,
  }
}

export function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function contractualDueDate(year: number, month: number, dueDay: number) {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return null
  const day = Math.min(dueDay, lastDayOfMonth(year, month))
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function addCalendarDays(value: string, days: number) {
  const parts = isoParts(value)
  if (!parts) throw new Error(`Invalid ISO date: ${value}`)
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return date.toISOString().slice(0, 10)
}

function cadenceMonths(source: RecurringCycleSource) {
  if (!source.recurrence_type) return null
  const cadence = String(source.recurrence_type).toLowerCase()
  if (cadence === 'monthly') return Math.max(1, Number(source.recurrence_interval || 1))
  if (cadence === 'quarterly' || cadence === 'every_3_months') return 3
  if (cadence === 'annual' || cadence === 'yearly') return 12
  if (cadence === 'custom') return Math.max(1, Number(source.recurrence_interval || 0)) || null
  return null
}

function activeMonths(source: RecurringCycleSource) {
  if (!source.active_months) return null
  const months = source.active_months
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 12)
  return months.length ? new Set(months) : new Set<number>()
}

export function enumerateRecurringCycles({
  source,
  startDate,
  horizonEnd,
  existingCycles = [],
}: {
  source: RecurringCycleSource
  startDate: string
  horizonEnd: string
  existingCycles?: Array<{ year?: number; month?: number; dueDate?: string | null; expected_date?: string | null }>
}): RecurringCycle[] {
  if (source.is_active === false) return []
  const start = isoParts(startDate)
  const end = isoParts(horizonEnd)
  if (!start || !end || startDate > horizonEnd) return []

  const recurrenceType = String(source.recurrence_type || '').toLowerCase()
  const anchorDate = recurrenceAnchorDate(source)
  const existingDateKeys = new Set(existingCycles
    .map((cycle) => cycle.dueDate || cycle.expected_date)
    .filter((value): value is string => Boolean(value))
    .map((value) => value.slice(0, 10)))

  if (recurrenceType === 'biweekly') {
    if (!anchorDate) return []
    const sourceEnd = source.end_date?.slice(0, 10) || null
    let dueDate = anchorDate
    while (dueDate < startDate) dueDate = addCalendarDays(dueDate, 14)
    const cycles: RecurringCycle[] = []
    while (dueDate <= horizonEnd && (!sourceEnd || dueDate <= sourceEnd)) {
      if (!existingDateKeys.has(dueDate)) {
        const parts = isoParts(dueDate)!
        cycles.push({ scheduleId: source.id, year: parts.year, month: parts.month, dueDate })
      }
      dueDate = addCalendarDays(dueDate, 14)
    }
    return cycles
  }

  if (!source.due_day) return []
  const cadence = cadenceMonths(source)
  const allowedMonths = activeMonths(source)
  if (!cadence && !allowedMonths) return []

  const sourceStart = source.start_date?.slice(0, 10) || source.created_at?.slice(0, 10) || startDate
  const sourceEnd = source.end_date?.slice(0, 10) || null
  const anchor = isoParts(sourceStart) || start
  const anchorMonth = monthIndex(anchor.year, anchor.month)
  const firstMonth = monthIndex(start.year, start.month)
  const lastMonth = monthIndex(end.year, end.month)
  const existingCycleKeys = new Set(
    existingCycles.map(({ year, month }) => `${year}-${month}`)
  )
  const cycles: RecurringCycle[] = []

  for (let index = firstMonth; index <= lastMonth; index += 1) {
    const { year, month } = monthFromIndex(index)
    if (allowedMonths && !allowedMonths.has(month)) continue
    if (!allowedMonths && cadence && (index - anchorMonth) % cadence !== 0) continue
    const dueDate = contractualDueDate(year, month, source.due_day)
    if (!dueDate) continue
    if (dueDate < startDate || dueDate > horizonEnd) continue
    if (dueDate < sourceStart) continue
    if (sourceEnd && dueDate > sourceEnd) continue
    if (existingDateKeys.has(dueDate) || existingCycleKeys.has(`${year}-${month}`)) continue
    cycles.push({ scheduleId: source.id, year, month, dueDate })
  }

  return cycles
}
