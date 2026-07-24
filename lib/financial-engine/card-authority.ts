export type AuthoritativeCardTermsInput = {
  plaidMinimumPayment?: number | string | null
  plaidDueDate?: string | null
  manualMinimumPayment?: number | string | null
  manualName?: string | null
  manualDueDay?: number | null
  scheduleMinimumPayment?: number | string | null
  scheduleName?: string | null
  scheduleDueDay?: number | null
  timelineMinimumPayment?: number | string | null
  timelineDueDate?: string | null
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function manualCardCreationFinancials(creditLimit: unknown) {
  return {
    credit_limit: nullableNumber(creditLimit),
    balance: null,
  } as const
}

export function cardUtilizationPercent(balance: number | null, creditLimit: number | null) {
  if (balance === null || creditLimit === null || creditLimit <= 0) return null
  return Math.round((balance / creditLimit) * 100)
}

function positiveNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function selectAuthoritativeCardTerms(input: AuthoritativeCardTermsInput) {
  const plaidMinimum = positiveNumber(input.plaidMinimumPayment)
  const manualMinimum = positiveNumber(input.manualMinimumPayment)
  const scheduleMinimum = positiveNumber(input.scheduleMinimumPayment)
  const timelineMinimum = positiveNumber(input.timelineMinimumPayment)
  const minimumPayment = plaidMinimum ?? manualMinimum ?? scheduleMinimum ?? timelineMinimum
  const minimumPaymentSource = plaidMinimum !== null
    ? 'Plaid Liabilities'
    : manualMinimum !== null
      ? `Manual card: ${input.manualName || 'card'}`
      : scheduleMinimum !== null
        ? `Recurring schedule: ${input.scheduleName || 'payment'}`
        : timelineMinimum !== null
          ? 'Timeline payment instance'
          : null
  const dueDay = input.scheduleDueDay ?? input.manualDueDay ?? null
  const nextDueDate = input.timelineDueDate || input.plaidDueDate || null
  const dueDateSource = input.timelineDueDate
    ? 'Linked Timeline obligation'
    : input.plaidDueDate
      ? 'Plaid Liabilities'
      : dueDay
        ? input.scheduleDueDay
          ? `Recurring schedule: ${input.scheduleName || 'payment'}`
          : `Manual card: ${input.manualName || 'card'}`
        : null

  return { minimumPayment, minimumPaymentSource, dueDay, nextDueDate, dueDateSource }
}
