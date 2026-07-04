'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/requireUser'
import {
  archivePlanningFund,
  createPlanningFund,
  movePlanningFunds,
  updatePlanningFund,
} from '@/lib/financial-engine/planning-management'

function formText(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function formNullableText(formData: FormData, key: string) {
  const value = formText(formData, key)
  return value || null
}

function formMoney(formData: FormData, key: string) {
  const rawValue = formText(formData, key)
  if (!rawValue) return 0

  const value = Number(rawValue)
  return Number.isFinite(value) ? value : 0
}

function redirectWithError(message: string) {
  redirect(`/planning?error=${encodeURIComponent(message)}`)
}

function movementNote(direction: 'add' | 'spend', amount: number, note: string | null) {
  const action = direction === 'add' ? 'Added funds' : 'Used funds'
  const timestamp = new Date().toISOString().slice(0, 10)
  const amountText = amount.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })

  return [timestamp, `${action}: $${amountText}`, note]
    .filter(Boolean)
    .join(' - ')
}

export async function createPlanningFundAction(formData: FormData) {
  const { supabase, user } = await requireUser()

  try {
    await createPlanningFund(supabase, {
      userId: user.id,
      name: formText(formData, 'name'),
      category: formText(formData, 'category'),
      priorityLevel: formText(formData, 'priorityLevel'),
      targetAmount: formMoney(formData, 'targetAmount'),
      currentAmount: formMoney(formData, 'currentAmount'),
      dueDate: formNullableText(formData, 'dueDate'),
      owner: formNullableText(formData, 'owner'),
      notes: formNullableText(formData, 'notes'),
    })
  } catch (error) {
    redirectWithError(
      error instanceof Error ? error.message : 'Could not create fund.'
    )
  }

  revalidatePath('/planning')
  redirect('/planning?saved=created')
}

export async function updatePlanningFundAction(formData: FormData) {
  const { supabase, user } = await requireUser()
  const id = formText(formData, 'id')

  try {
    await updatePlanningFund(supabase, {
      id,
      userId: user.id,
      name: formText(formData, 'name'),
      category: formText(formData, 'category'),
      priorityLevel: formText(formData, 'priorityLevel'),
      targetAmount: formMoney(formData, 'targetAmount'),
      currentAmount: formMoney(formData, 'currentAmount'),
      dueDate: formNullableText(formData, 'dueDate'),
      owner: formNullableText(formData, 'owner'),
      notes: formNullableText(formData, 'notes'),
    })
  } catch (error) {
    redirectWithError(
      error instanceof Error ? error.message : 'Could not update fund.'
    )
  }

  revalidatePath('/planning')
  redirect('/planning?saved=updated')
}

export async function movePlanningFundsAction(formData: FormData) {
  const { supabase } = await requireUser()
  const direction = formText(formData, 'direction') === 'spend' ? 'spend' : 'add'
  const amount = formMoney(formData, 'amount')

  try {
    await movePlanningFunds(supabase, {
      id: formText(formData, 'id'),
      amount,
      direction,
      notes: movementNote(direction, amount, formNullableText(formData, 'notes')),
    })
  } catch (error) {
    redirectWithError(
      error instanceof Error ? error.message : 'Could not move funds.'
    )
  }

  revalidatePath('/planning')
  redirect(`/planning?saved=${direction === 'add' ? 'funded' : 'spent'}`)
}

export async function archivePlanningFundAction(formData: FormData) {
  const { supabase, user } = await requireUser()

  try {
    await archivePlanningFund(supabase, {
      id: formText(formData, 'id'),
      userId: user.id,
      notes: formNullableText(formData, 'archiveReason'),
    })
  } catch (error) {
    redirectWithError(
      error instanceof Error ? error.message : 'Could not archive fund.'
    )
  }

  revalidatePath('/planning')
  redirect('/planning?saved=archived')
}
