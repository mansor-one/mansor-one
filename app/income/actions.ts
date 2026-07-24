'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/requireUser'
import {
  createIncome,
  incomeCadenceValue,
  incomeCategoryValue,
  incomeConfidenceValue,
  incomeDestinationSourceValue,
  incomeOwnerScopeValue,
  incomeStatusValue,
  incomeTypeValue,
  updateIncome,
} from '@/lib/financial-engine/income-management'

function textValue(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function nullableTextValue(formData: FormData, key: string) {
  const value = textValue(formData, key)
  return value || null
}

function moneyValue(formData: FormData, key: string) {
  const value = Number(textValue(formData, key))
  return Number.isFinite(value) ? value : 0
}

function booleanValue(formData: FormData, key: string) {
  return formData.get(key) === 'on'
}

function destinationParts(value: string) {
  if (!value) {
    return {
      destinationAccountId: null,
      destinationAccountSource: null,
    }
  }

  const [source, id] = value.split(':')
  return {
    destinationAccountId: id || null,
    destinationAccountSource: incomeDestinationSourceValue(source),
  }
}

function mutationInput(formData: FormData, userId: string) {
  const destination = destinationParts(textValue(formData, 'destination'))

  return {
    userId,
    name: textValue(formData, 'name'),
    amount: moneyValue(formData, 'amount'),
    incomeType: incomeTypeValue(textValue(formData, 'incomeType')),
    categoryCode: incomeCategoryValue(textValue(formData, 'categoryCode')),
    amountIsEstimated: booleanValue(formData, 'amountIsEstimated'),
    confidence: incomeConfidenceValue(textValue(formData, 'confidence')),
    expectedDate: textValue(formData, 'expectedDate'),
    cadence: incomeCadenceValue(textValue(formData, 'cadence')),
    ownerScope: incomeOwnerScopeValue(textValue(formData, 'ownerScope')),
    status: incomeStatusValue(textValue(formData, 'status')),
    notes: nullableTextValue(formData, 'notes'),
    ...destination,
  }
}

function redirectWithError(message: string) {
  redirect(`/income?error=${encodeURIComponent(message)}`)
}

function revalidateIncomeSurfaces() {
  revalidatePath('/income')
  revalidatePath('/timeline')
}

export async function createIncomeAction(formData: FormData) {
  const { supabase, user } = await requireUser()

  try {
    await createIncome(supabase, mutationInput(formData, user.id))
  } catch (error) {
    redirectWithError(
      error instanceof Error ? error.message : 'Could not create income.'
    )
  }

  revalidateIncomeSurfaces()
  redirect('/income?saved=created')
}

export async function updateIncomeAction(formData: FormData) {
  const { supabase, user } = await requireUser()

  try {
    await updateIncome(supabase, {
      id: textValue(formData, 'incomeId'),
      ...mutationInput(formData, user.id),
    })
  } catch (error) {
    redirectWithError(
      error instanceof Error ? error.message : 'Could not update income.'
    )
  }

  revalidateIncomeSurfaces()
  redirect('/income?saved=updated')
}
