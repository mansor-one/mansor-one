import 'server-only'

import { decrypt } from '@/lib/security/encryption'

export type PlaidConnectionTokenRow = {
  access_token: string | null
  encrypted_access_token: string | null
  token_iv: string | null
  token_auth_tag: string | null
}

export function connectionAccessToken(connection: PlaidConnectionTokenRow) {
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
