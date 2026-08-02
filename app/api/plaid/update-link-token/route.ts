import { NextResponse } from 'next/server'
import { CountryCode, Products } from 'plaid'
import { requireApiUser } from '@/lib/auth/requireApiUser'
import { getAuthorizedRepairConnection } from '@/lib/plaid/authorized-connection'
import { plaidClient } from '@/lib/plaid/client'
import { connectionAccessToken } from '@/lib/plaid/connection-token'
import { requireMutationOrigin } from '@/lib/security/request-origin'
import { createServerSupabase } from '@/lib/supabase/server'

function connectionIdFrom(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function plaidErrorCode(error: unknown) {
  const plaidError = error as {
    response?: { data?: { error_code?: string } }
  }
  return plaidError.response?.data?.error_code || 'LINK_TOKEN_CREATE_FAILED'
}

export async function POST(request: Request) {
  const originError = requireMutationOrigin(request)
  if (originError) return originError

  const { supabase } = await createServerSupabase()
  const auth = await requireApiUser(supabase)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as {
    connectionId?: unknown
    requestLiabilitiesConsent?: unknown
  } | null
  const connectionId = connectionIdFrom(body?.connectionId)
  if (!connectionId) {
    return NextResponse.json(
      { error: 'La conexión es requerida' },
      { status: 400 }
    )
  }

  const authorized = await getAuthorizedRepairConnection(
    supabase,
    auth.user,
    connectionId
  )
  if (!authorized.ok) {
    return NextResponse.json(
      { error: authorized.error },
      { status: authorized.status }
    )
  }

  const accessToken = connectionAccessToken(authorized.connection)
  if (!accessToken) {
    return NextResponse.json(
      { error: 'La conexión no se puede reparar en este momento' },
      { status: 409 }
    )
  }

  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: auth.user.id },
      client_name: 'Mansor One',
      country_codes: [CountryCode.Us],
      language: 'es',
      access_token: accessToken,
      ...(body?.requestLiabilitiesConsent === true
        ? { additional_consented_products: [Products.Liabilities] }
        : {}),
    })

    console.info('Plaid Update Mode token created', {
      connection_id: connectionId,
      institution_name: authorized.connection.institution_name,
    })
    return NextResponse.json({ link_token: response.data.link_token })
  } catch (error) {
    console.warn('Plaid Update Mode token creation failed', {
      connection_id: connectionId,
      error_code: plaidErrorCode(error),
    })
    return NextResponse.json(
      { error: 'No pudimos iniciar la reparación de la conexión' },
      { status: 502 }
    )
  }
}
