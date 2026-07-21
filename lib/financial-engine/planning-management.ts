import type { FinancialSupabaseClient } from './types'

export const planningPriorityOptions = [
  { value: 'critical', label: 'Critical' },
  { value: 'regular', label: 'Regular' },
  { value: 'non_critical', label: 'Non-critical' },
] as const

export type PlanningPriorityLevel =
  (typeof planningPriorityOptions)[number]['value']

export type PlanningFund = {
  id: string
  user_id: string
  name: string
  item_type: string
  priority_level: PlanningPriorityLevel | string
  status: string
  target_amount: number | null
  current_amount: number | null
  spent_amount: number | null
  due_date: string | null
  owner: string | null
  category: string | null
  notes: string | null
  is_archived: boolean | null
  is_completed: boolean | null
  legacy_source: string | null
  legacy_id: string | null
  created_at: string | null
  updated_at: string | null
}

export type PlanningFundMovement = {
  id: string
  planning_item_id: string | null
  transaction_type:
    | 'assign'
    | 'remove'
    | 'transfer_in'
    | 'transfer_out'
    | 'adjustment'
    | string
  amount: number
  from_item_id: string | null
  to_item_id: string | null
  notes: string | null
  created_at: string | null
  user_id: string | null
  quick_entry_id: string | null
  plaid_import_id: string | null
  canonical_category: string | null
  household_owner: string | null
}

export type UpsertPlanningFundInput = {
  id?: string
  userId: string
  name: string
  category: string
  priorityLevel: string
  targetAmount: number
  currentAmount: number
  dueDate: string | null
  owner: string | null
  notes: string | null
}

export type MovePlanningFundsInput = {
  id: string
  amount: number
  direction: 'add' | 'spend'
  notes: string | null
}

function normalizePriority(value: string): PlanningPriorityLevel {
  if (value === 'critical' || value === 'non_critical') return value
  return 'regular'
}

function normalizeMoney(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value * 100) / 100)
}

function normalizeText(value: string | null | undefined) {
  return String(value || '').trim()
}

function normalizedNullableText(value: string | null | undefined) {
  const text = normalizeText(value)
  return text || null
}

function appendNote(existing: string | null, next: string | null) {
  const notes = [existing, next]
    .map((note) => normalizeText(note))
    .filter(Boolean)

  return notes.length > 0 ? notes.join('\n') : null
}

export async function getPlanningFunds(
  supabase: FinancialSupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from('planning_items')
    .select('*')
    .eq('user_id', userId)
    .order('priority_level', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) throw error

  return (data || []) as PlanningFund[]
}

export async function getPlanningFundMovements(
  supabase: FinancialSupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from('planning_item_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data || []) as PlanningFundMovement[]
}

export async function createPlanningFund(
  supabase: FinancialSupabaseClient,
  input: UpsertPlanningFundInput
) {
  const name = normalizeText(input.name)
  if (!name) throw new Error('Fund name is required.')

  const row = {
    user_id: input.userId,
    name,
    item_type: 'fund',
    priority_level: normalizePriority(input.priorityLevel),
    status: 'open',
    target_amount: normalizeMoney(input.targetAmount),
    current_amount: 0,
    due_date: input.dueDate || null,
    owner: normalizedNullableText(input.owner),
    category: normalizedNullableText(input.category) || 'General',
    notes: normalizedNullableText(input.notes),
    is_archived: false,
    is_completed: false,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('planning_items')
    .insert(row)
    .select('*')
    .single()

  if (error) throw error

  const fund = data as PlanningFund
  const initialAmount = normalizeMoney(input.currentAmount)

  if (initialAmount > 0) {
    await movePlanningFunds(supabase, {
      id: fund.id,
      amount: initialAmount,
      direction: 'add',
      notes: 'Initial allocation',
    })
  }

  return fund
}

export async function updatePlanningFund(
  supabase: FinancialSupabaseClient,
  input: UpsertPlanningFundInput & { id: string }
) {
  const name = normalizeText(input.name)
  if (!name) throw new Error('Fund name is required.')

  const row = {
    name,
    item_type: 'fund',
    priority_level: normalizePriority(input.priorityLevel),
    target_amount: normalizeMoney(input.targetAmount),
    due_date: input.dueDate || null,
    owner: normalizedNullableText(input.owner),
    category: normalizedNullableText(input.category) || 'General',
    notes: normalizedNullableText(input.notes),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('planning_items')
    .update(row)
    .eq('id', input.id)
    .eq('user_id', input.userId)
    .select('*')
    .single()

  if (error) throw error

  return data as PlanningFund
}

export async function movePlanningFunds(
  supabase: FinancialSupabaseClient,
  input: MovePlanningFundsInput
) {
  const amount = normalizeMoney(input.amount)
  if (amount <= 0) throw new Error('Movement amount must be greater than zero.')

  const { data, error } = await supabase.rpc(
    'record_planning_fund_movement',
    {
      p_amount: amount,
      p_notes: normalizedNullableText(input.notes),
      p_planning_item_id: input.id,
      p_transaction_type: input.direction === 'add' ? 'assign' : 'remove',
    }
  )

  if (error) throw error

  return data as PlanningFundMovement
}

export async function archivePlanningFund(
  supabase: FinancialSupabaseClient,
  input: { id: string; userId: string; notes?: string | null }
) {
  const { data: existing, error: loadError } = await supabase
    .from('planning_items')
    .select('*')
    .eq('id', input.id)
    .eq('user_id', input.userId)
    .single()

  if (loadError) throw loadError

  const fund = existing as PlanningFund

  const { data, error } = await supabase
    .from('planning_items')
    .update({
      status: 'archived',
      is_archived: true,
      notes: appendNote(fund.notes, normalizedNullableText(input.notes)),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id)
    .eq('user_id', input.userId)
    .select('*')
    .single()

  if (error) throw error

  return data as PlanningFund
}
