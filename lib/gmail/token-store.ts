import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { decryptGoogleRefreshToken, encryptGoogleRefreshToken } from './token-crypto'

function gmailEncryptionKey() {
  const rootSecret = process.env.MANSOR_TOKEN_ENCRYPTION_KEY || process.env.PLAID_TOKEN_ENCRYPTION_KEY
  if (!rootSecret) throw new Error('Gmail integration is unavailable')
  return rootSecret
}

export async function storeHouseholdGoogleRefreshToken(householdId: string, refreshToken: string) {
  const admin = getSupabaseAdmin()
  const encrypted = encryptGoogleRefreshToken(refreshToken, gmailEncryptionKey())
  const now = new Date().toISOString()
  const { error } = await admin.from('gmail_evidence_sync_state').upsert({
    household_id: householdId,
    encrypted_refresh_token: encrypted.encryptedRefreshToken,
    token_iv: encrypted.tokenIv,
    token_auth_tag: encrypted.tokenAuthTag,
    last_authorized_at: now,
    updated_at: now,
  }, { onConflict: 'household_id' })
  if (error) throw new Error('Google authorization could not be saved')
}

export async function getHouseholdGoogleRefreshToken(householdId: string) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from('gmail_evidence_sync_state')
    .select('encrypted_refresh_token, token_iv, token_auth_tag')
    .eq('household_id', householdId)
    .maybeSingle()
  if (error) throw new Error('Gmail integration is unavailable')
  if (data?.encrypted_refresh_token && data.token_iv && data.token_auth_tag) {
    return decryptGoogleRefreshToken(data.encrypted_refresh_token, data.token_iv, data.token_auth_tag, gmailEncryptionKey())
  }
  return process.env.GOOGLE_REFRESH_TOKEN || null
}
