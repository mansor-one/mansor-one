import type { SupabaseClient, User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { Database } from '@/lib/supabase/database.types'
import { requireApiUser } from './requireApiUser'
import { isHouseholdGmailManagerMembership } from './gmail-manager-policy'

type GmailManagerSuccess = {
  ok: true
  user: User
  householdId: string
}

type GmailManagerFailure = {
  ok: false
  response: NextResponse<{ error: string }>
}

export type GmailManagerResult = GmailManagerSuccess | GmailManagerFailure

/**
 * The deployment-wide Gmail mailbox is managed only by an active household
 * owner. Membership and role are derived from the validated Supabase user.
 */
export async function requireHouseholdGmailManager(
  supabase: SupabaseClient<Database>
): Promise<GmailManagerResult> {
  const auth = await requireApiUser(supabase)
  if (!auth.ok) return auth

  const { data: membership, error } = await supabase
    .from('household_members')
    .select('household_id, role, active')
    .eq('auth_user_id', auth.user.id)
    .eq('role', 'owner')
    .eq('active', true)
    .maybeSingle()

  const householdId = membership?.household_id
  if (
    error ||
    !householdId ||
    !isHouseholdGmailManagerMembership(membership)
  ) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return {
    ok: true,
    user: auth.user,
    householdId,
  }
}
