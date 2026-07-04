import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/security/encryption'
import { plaidClient } from './client'

const requiredConfirmation = 'REVOKE'

type PlaidConnectionTokenRow = {
  id: string
  user_id: string
  institution_name: string | null
  status: string | null
  access_token: string | null
  encrypted_access_token: string | null
  token_iv: string | null
  token_auth_tag: string | null
}

export type RevokePlaidConnectionInput = {
  connectionId: string
  userId: string
  confirmation: string
  reason: string | null
}

function connectionAccessToken(connection: PlaidConnectionTokenRow) {
  if (
    connection.encrypted_access_token &&
    connection.token_iv &&
    connection.token_auth_tag
  ) {
    return decrypt(
      connection.encrypted_access_token,
      connection.token_iv,
      connection.token_auth_tag
    )
  }

  return connection.access_token
}

export async function revokePlaidConnection(
  supabase: SupabaseClient,
  input: RevokePlaidConnectionInput
) {
  if (input.confirmation.trim() !== requiredConfirmation) {
    throw new Error('Confirmation text does not match.')
  }

  const { data: connection, error: connectionError } = await supabase
    .from('plaid_connections')
    .select(
      'id, user_id, institution_name, status, access_token, encrypted_access_token, token_iv, token_auth_tag'
    )
    .eq('id', input.connectionId)
    .eq('user_id', input.userId)
    .single()

  if (connectionError) throw connectionError
  if (!connection) throw new Error('Plaid connection not found.')

  const row = connection as PlaidConnectionTokenRow

  if (row.status === 'revoked') {
    throw new Error('Plaid connection is already revoked.')
  }

  if (row.status === 'archived') {
    throw new Error('Archived connection must be unarchived before revoke.')
  }

  const accessToken = connectionAccessToken(row)

  if (!accessToken) {
    throw new Error('Plaid connection has no access token to revoke.')
  }

  const reason =
    input.reason?.trim() ||
    'Plaid connection revoked from Portfolio by authenticated user.'
  const now = new Date().toISOString()

  await plaidClient.itemRemove({
    access_token: accessToken,
    reason_note: reason,
  })

  const { data, error } = await supabase
    .from('plaid_connections')
    .update({
      status: 'revoked',
      archived_at: now,
      disconnected_at: now,
      archive_reason: reason,
      last_sync_error: null,
      status_updated_at: now,
    })
    .eq('id', input.connectionId)
    .eq('user_id', input.userId)
    .select(
      'id, institution_name, status, archived_at, archive_reason, disconnected_at, status_updated_at'
    )
    .single()

  if (error) throw error

  return data
}
