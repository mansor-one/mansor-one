'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/requireUser'
import {
  createLegacyFinancialGoal,
  updateLegacyFinancialGoal,
} from '@/lib/financial-engine'

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) || '').trim()
}

function numberValue(formData: FormData, key: string) {
  return Number(textValue(formData, key) || 0)
}

function nullableDateValue(formData: FormData, key: string) {
  const value = textValue(formData, key)
  return value || null
}

export async function createGoalAction(formData: FormData) {
  const name = textValue(formData, 'name')

  if (!name) {
    redirect('/goals?error=missing_name')
  }

  const { supabase } = await requireUser()
  try {
    await createLegacyFinancialGoal(supabase, {
      name,
      goalType: textValue(formData, 'goalType') || 'Custom',
      targetAmount: numberValue(formData, 'targetAmount'),
      currentAmount: numberValue(formData, 'currentAmount'),
      targetDate: nullableDateValue(formData, 'targetDate'),
      priority: numberValue(formData, 'priority') || 3,
      notes: textValue(formData, 'notes'),
    })
  } catch (error) {
    redirect(
      `/goals?error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`
    )
  }

  revalidatePath('/goals')
  redirect('/goals?saved=created')
}

export async function updateGoalAction(formData: FormData) {
  const goalId = textValue(formData, 'goalId')
  const name = textValue(formData, 'name')

  if (!goalId || !name) {
    redirect('/goals?error=missing_goal')
  }

  const { supabase } = await requireUser()
  try {
    await updateLegacyFinancialGoal(supabase, goalId, {
      name,
      goalType: textValue(formData, 'goalType') || 'Custom',
      targetAmount: numberValue(formData, 'targetAmount'),
      currentAmount: numberValue(formData, 'currentAmount'),
      targetDate: nullableDateValue(formData, 'targetDate'),
      priority: numberValue(formData, 'priority') || 3,
      notes: textValue(formData, 'notes'),
    })
  } catch (error) {
    redirect(
      `/goals?error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`
    )
  }

  revalidatePath('/goals')
  redirect('/goals?saved=updated')
}
