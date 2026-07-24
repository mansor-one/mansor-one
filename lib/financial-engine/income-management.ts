import type { FinancialSupabaseClient, IncomeSchedule } from './types'

export const incomeTypeOptions = [
  { value: 'one_time', label: 'One-time' },
  { value: 'recurring', label: 'Recurring' },
] as const

export const incomeConfidenceOptions = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'likely', label: 'Likely' },
  { value: 'estimated', label: 'Estimated' },
] as const

export const incomeCadenceOptions = [
  { value: 'one_time', label: 'One-time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'irregular', label: 'Irregular' },
] as const

export const incomeStatusOptions = [
  { value: 'expected', label: 'Expected' },
  { value: 'received', label: 'Received' },
  { value: 'missed', label: 'Missed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

export const incomeOwnerScopeOptions = [
  { value: 'household', label: 'Household' },
  { value: 'manuel', label: 'Manuel' },
  { value: 'soraya', label: 'Soraya' },
  { value: 'business', label: 'Business' },
] as const

export const incomeCategoryOptions = [
  { value: 'income_deposit', label: 'Deposit' },
  { value: 'income_salary', label: 'Salary' },
  { value: 'income_bonus', label: 'Bonus' },
  { value: 'income_pension', label: 'Pension' },
  { value: 'income_severance', label: 'Severance' },
  { value: 'income_unemployment', label: 'Unemployment' },
  { value: 'income_refund', label: 'Refund' },
  { value: 'income_reimbursement', label: 'Reimbursement' },
  { value: 'income_interest', label: 'Interest Income' },
] as const

export type IncomeManagementType = (typeof incomeTypeOptions)[number]['value']
export type IncomeManagementConfidence =
  (typeof incomeConfidenceOptions)[number]['value']
export type IncomeManagementCadence =
  (typeof incomeCadenceOptions)[number]['value']
export type IncomeManagementStatus = (typeof incomeStatusOptions)[number]['value']
export type IncomeManagementOwnerScope =
  (typeof incomeOwnerScopeOptions)[number]['value']
export type IncomeManagementCategory =
  (typeof incomeCategoryOptions)[number]['value']
export type IncomeManagementDestinationSource = 'manual' | 'plaid'

export type IncomeDestinationOption = {
  id: string
  source: IncomeManagementDestinationSource
  label: string
  detail: string
}

export type IncomeMutationInput = {
  id?: string
  userId: string
  name: string
  amount: number
  incomeType: IncomeManagementType
  categoryCode: IncomeManagementCategory
  amountIsEstimated: boolean
  confidence: IncomeManagementConfidence
  expectedDate: string
  cadence: IncomeManagementCadence
  ownerScope: IncomeManagementOwnerScope
  destinationAccountId: string | null
  destinationAccountSource: IncomeManagementDestinationSource | null
  status: IncomeManagementStatus
  notes: string | null
}

function assertOption<T extends string>(
  value: string,
  options: readonly { value: T }[],
  fallback: T
): T {
  return options.some((option) => option.value === value)
    ? (value as T)
    : fallback
}

function assertDestinationSource(
  value: string | null
): IncomeManagementDestinationSource | null {
  return value === 'manual' || value === 'plaid' ? value : null
}

export function incomeTypeValue(value: string) {
  return assertOption(value, incomeTypeOptions, 'one_time')
}

export function incomeConfidenceValue(value: string) {
  return assertOption(value, incomeConfidenceOptions, 'confirmed')
}

export function incomeCadenceValue(value: string) {
  return assertOption(value, incomeCadenceOptions, 'one_time')
}

export function incomeStatusValue(value: string) {
  return assertOption(value, incomeStatusOptions, 'expected')
}

export function incomeOwnerScopeValue(value: string) {
  return assertOption(value, incomeOwnerScopeOptions, 'household')
}

export function incomeCategoryValue(value: string) {
  return assertOption(value, incomeCategoryOptions, 'income_deposit')
}

export function incomeDestinationSourceValue(value: string | null) {
  return assertDestinationSource(value)
}

function cleanName(value: string) {
  const name = value.trim()
  if (!name) throw new Error('Income name is required.')
  return name
}

function cleanAmount(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Income amount must be zero or greater.')
  }

  return value
}

function cleanExpectedDate(value: string) {
  if (!value) throw new Error('Expected date is required.')
  return value
}

function receivedAtForStatus(status: IncomeManagementStatus) {
  return status === 'received' ? new Date().toISOString() : null
}

function incomePayload(input: IncomeMutationInput) {
  return {
    name: cleanName(input.name),
    amount: cleanAmount(input.amount),
    income_type: input.incomeType,
    category_code: input.categoryCode,
    amount_is_estimated: input.amountIsEstimated,
    confidence: input.confidence,
    next_expected_date: cleanExpectedDate(input.expectedDate),
    cadence: input.cadence,
    owner_scope: input.ownerScope,
    destination_account_id: input.destinationAccountId,
    destination_account_source: input.destinationAccountSource,
    status: input.status,
    is_active: input.status !== 'cancelled',
    received_at: receivedAtForStatus(input.status),
    notes: input.notes,
    user_id: input.userId,
  }
}

export async function getIncomeRows(
  supabase: FinancialSupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from('income_schedule')
    .select('*')
    .eq('user_id', userId)
    .order('next_expected_date', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error

  return (data || []) as IncomeSchedule[]
}

export async function getIncomeDestinationOptions(
  supabase: FinancialSupabaseClient,
  userId: string
) {
  const [manualResult, plaidResult] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, account_type, owner_scope')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_hidden', false)
      .order('name', { ascending: true }),
    supabase
      .from('plaid_accounts')
      .select('id, display_name, name, institution_name, subtype, owner_scope')
      .eq('user_id', userId)
      .eq('is_hidden', false)
      .neq('account_status', 'archived')
      .order('institution_name', { ascending: true }),
  ])

  if (manualResult.error) throw manualResult.error
  if (plaidResult.error) throw plaidResult.error

  const manualOptions = (manualResult.data || []).map((account) => ({
    id: account.id as string,
    source: 'manual' as const,
    label: account.name || 'Manual account',
    detail: [account.account_type, account.owner_scope]
      .filter(Boolean)
      .join(' · '),
  }))
  const plaidOptions = (plaidResult.data || []).map((account) => ({
    id: account.id as string,
    source: 'plaid' as const,
    label: account.display_name || account.name || 'Connected account',
    detail: [account.institution_name, account.subtype, account.owner_scope]
      .filter(Boolean)
      .join(' · '),
  }))

  return [...manualOptions, ...plaidOptions] satisfies IncomeDestinationOption[]
}

export async function createIncome(
  supabase: FinancialSupabaseClient,
  input: IncomeMutationInput
) {
  const { error } = await supabase
    .from('income_schedule')
    .insert(incomePayload(input))

  if (error) throw error
}

export async function updateIncome(
  supabase: FinancialSupabaseClient,
  input: IncomeMutationInput & { id: string }
) {
  if (!input.id) throw new Error('Income id is required.')

  const { error } = await supabase
    .from('income_schedule')
    .update(incomePayload(input))
    .eq('id', input.id)
    .eq('user_id', input.userId)

  if (error) throw error
}
