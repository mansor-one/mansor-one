'use server'

import { requireUser } from '@/lib/auth/requireUser'
import {
  manualAccountStatusOptions,
  plaidConnectionStatusOptions,
  updateManualAccount,
  updatePlaidAccount,
  updatePlaidConnection,
  type ManualAccountStatus,
  type PlaidConnectionStatus,
} from '@/lib/financial-engine'
import { revokePlaidConnection } from '@/lib/plaid/revoke-connection'
import { createServerSupabase } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

function booleanValue(formData: FormData, key: string) {
  return formData.get(key) === 'on'
}

function numberValue(formData: FormData, key: string) {
  const value = Number(stringValue(formData, key))
  return Number.isFinite(value) ? value : NaN
}

function statusValue(value: string): ManualAccountStatus {
  return manualAccountStatusOptions.some((option) => option.value === value)
    ? (value as ManualAccountStatus)
    : 'active'
}

function connectionStatusValue(value: string): PlaidConnectionStatus {
  return plaidConnectionStatusOptions.some((option) => option.value === value)
    ? (value as PlaidConnectionStatus)
    : 'active'
}

export async function updateManualAccountAction(formData: FormData) {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)

  try {
    await updateManualAccount(supabase, {
      id: stringValue(formData, 'accountId'),
      userId: user.id,
      name: stringValue(formData, 'name'),
      balance: numberValue(formData, 'balance'),
      ownerScope: stringValue(formData, 'ownerScope'),
      status: statusValue(stringValue(formData, 'status')),
      isSpendable: booleanValue(formData, 'isSpendable'),
      replacementAccountId: stringValue(formData, 'replacementAccountId') || null,
      archiveReason: stringValue(formData, 'archiveReason') || null,
    })
  } catch {
    redirect('/portfolio?error=manual-account-update')
  }

  revalidatePath('/portfolio')
  revalidatePath('/')
  redirect('/portfolio?saved=manual-account')
}

export async function updatePlaidAccountAction(formData: FormData) {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)

  try {
    await updatePlaidAccount(supabase, {
      id: stringValue(formData, 'plaidAccountId'),
      userId: user.id,
      displayName: stringValue(formData, 'displayName'),
      ownerScope: stringValue(formData, 'ownerScope'),
      status: statusValue(stringValue(formData, 'status')),
      includeInDashboard: booleanValue(formData, 'includeInDashboard'),
      isSpendable: booleanValue(formData, 'isSpendable'),
      archiveReason: stringValue(formData, 'archiveReason') || null,
    })
  } catch {
    redirect('/portfolio?error=plaid-account-update')
  }

  revalidatePath('/portfolio')
  revalidatePath('/')
  redirect('/portfolio?saved=plaid-account')
}

export async function updatePlaidConnectionAction(formData: FormData) {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)

  try {
    await updatePlaidConnection(supabase, {
      id: stringValue(formData, 'plaidConnectionId'),
      userId: user.id,
      status: connectionStatusValue(stringValue(formData, 'status')),
      archiveReason: stringValue(formData, 'archiveReason') || null,
    })
  } catch {
    redirect('/portfolio?error=plaid-connection-update')
  }

  revalidatePath('/portfolio')
  redirect('/portfolio?saved=plaid-connection')
}

export async function revokePlaidConnectionAction(formData: FormData) {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)

  try {
    await revokePlaidConnection(supabase, {
      connectionId: stringValue(formData, 'plaidConnectionId'),
      userId: user.id,
      confirmation: stringValue(formData, 'confirmation'),
      reason: stringValue(formData, 'reason') || null,
    })
  } catch {
    redirect('/portfolio?error=plaid-connection-revoke')
  }

  revalidatePath('/portfolio')
  redirect('/portfolio?saved=plaid-connection-revoked')
}
