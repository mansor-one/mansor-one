import 'server-only'

import type { SupabaseClient, User } from '@supabase/supabase-js'
import {
  canRepairPlaidConnection,
  plaidConnectionNeedsRepair,
} from './connection-health'

export type AuthorizedRepairConnection = {
  id: string
  user_id: string
  household_id: string
  institution_name: string | null
  status: string | null
  last_sync_error: string | null
  access_token: string | null
  encrypted_access_token: string | null
  token_iv: string | null
  token_auth_tag: string | null
  archived_at: string | null
}

export type RepairConnectionLookup =
  | { ok: true; connection: AuthorizedRepairConnection }
  | { ok: false; status: 403 | 404 | 409; error: string }

export async function getAuthorizedRepairConnection(
  supabase: SupabaseClient,
  user: User,
  connectionId: string
): Promise<RepairConnectionLookup> {
  const { data, error } = await supabase
    .from('plaid_connections')
    .select(
      'id, user_id, household_id, institution_name, status, last_sync_error, access_token, encrypted_access_token, token_iv, token_auth_tag, archived_at'
    )
    .eq('id', connectionId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, status: 404, error: 'Conexión no encontrada' }
  }

  const connection = data as AuthorizedRepairConnection
  if (connection.archived_at || connection.status === 'archived') {
    return {
      ok: false,
      status: 409,
      error: 'La conexión archivada no se puede reparar',
    }
  }

  const { data: membership, error: membershipError } = await supabase
    .from('household_members')
    .select('auth_user_id, household_id, role, active')
    .eq('auth_user_id', user.id)
    .eq('household_id', connection.household_id)
    .eq('active', true)
    .in('role', ['owner', 'member'])
    .maybeSingle()

  if (
    membershipError ||
    !canRepairPlaidConnection({
      authUserId: user.id,
      connectionHouseholdId: connection.household_id,
      membership,
    })
  ) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  if (
    !plaidConnectionNeedsRepair(
      connection.status,
      connection.last_sync_error
    )
  ) {
    return {
      ok: false,
      status: 409,
      error: 'La conexión no requiere reparación',
    }
  }

  if (!connection.user_id) {
    return {
      ok: false,
      status: 409,
      error: 'La conexión no tiene propietario configurado',
    }
  }

  return { ok: true, connection }
}
