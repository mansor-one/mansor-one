import { encrypt } from '@/lib/security/encryption'
import { requireMutationOrigin } from '@/lib/security/request-origin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

const configuration = new Configuration({
  basePath:
    PlaidEnvironments[
      process.env.PLAID_ENV as keyof typeof PlaidEnvironments
    ],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
      'PLAID-SECRET': process.env.PLAID_SECRET!,
    },
  },
})

const client = new PlaidApi(configuration)

export async function POST(request: Request) {
  try {
    const originError = requireMutationOrigin(request)
    if (originError) return originError

    const userSupabase = await createServerSupabase()

    const {
      data: { user },
      error: userError,
    } = await userSupabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const body = await request.json()

    if (!body?.public_token || typeof body.public_token !== 'string') {
      return NextResponse.json(
        { error: 'Invalid public token' },
        { status: 400 }
      )
    }

    const response = await client.itemPublicTokenExchange({
      public_token: body.public_token,
    })

    const encryptedToken = encrypt(response.data.access_token)
    const itemId = response.data.item_id

    const { error } = await getSupabaseAdmin()
      .from('plaid_connections')
      .insert({
       user_id: user.id,
        item_id: itemId,
        access_token: null,
        encrypted_access_token: encryptedToken.encrypted,
        token_iv: encryptedToken.iv,
        token_auth_tag: encryptedToken.authTag,
        institution_name:
          typeof body.institution_name === 'string'
            ? body.institution_name
            : 'Unknown',
      })

    if (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      console.error('Plaid connection insert error:', {
        message: errorMessage,
      })

      return NextResponse.json(
        {
          error: 'Could not save Plaid connection',
          access_token_received: false,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      item_id: itemId,
      access_token_received: true,
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    console.error('Plaid exchange-public-token error:', {
      message: errorMessage,
    })

    return NextResponse.json(
      {
        error: 'Unable to exchange Plaid public token',
        access_token_received: false,
      },
      { status: 500 }
    )
  }
}
