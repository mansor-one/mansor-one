import {
  addCalendarDays,
  contractualDueDate,
} from './recurring-cycle-enumerator.ts'

export type LegacyGraceInterpretation =
  | 'none'
  | 'same_day'
  | 'deadline_day_of_month'
  | 'duration_days'

export function resolveLegacyGraceSemantics({
  year,
  month,
  dueDay,
  legacyGraceDay,
}: {
  year: number
  month: number
  dueDay: number | null | undefined
  legacyGraceDay: number | null | undefined
}) {
  const contractualDay = Number(dueDay || 0)
  const legacyValue = Number(legacyGraceDay || 0)
  const dueDate = contractualDueDate(year, month, contractualDay)

  if (!dueDate) {
    return {
      dueDate: null,
      graceDeadline: null,
      graceDays: 0,
      legacyGraceDay: legacyValue || null,
      interpretation: 'none' as LegacyGraceInterpretation,
    }
  }

  if (!legacyValue || legacyValue === contractualDay) {
    return {
      dueDate,
      graceDeadline: dueDate,
      graceDays: 0,
      legacyGraceDay: legacyValue || null,
      interpretation: legacyValue
        ? 'same_day' as LegacyGraceInterpretation
        : 'none' as LegacyGraceInterpretation,
    }
  }

  // Project Phoenix established the compatibility rule for this overloaded
  // field: a value after the due day is a day-of-month deadline; a smaller
  // value is a duration. Callers consume the explicit derived fields below.
  if (legacyValue > contractualDay) {
    const graceDeadline = contractualDueDate(year, month, legacyValue) || dueDate
    return {
      dueDate,
      graceDeadline,
      graceDays: Math.max(
        0,
        Number(graceDeadline.slice(8, 10)) - Number(dueDate.slice(8, 10))
      ),
      legacyGraceDay: legacyValue,
      interpretation: 'deadline_day_of_month' as LegacyGraceInterpretation,
    }
  }

  return {
    dueDate,
    graceDeadline: addCalendarDays(dueDate, legacyValue),
    graceDays: legacyValue,
    legacyGraceDay: legacyValue,
    interpretation: 'duration_days' as LegacyGraceInterpretation,
  }
}
