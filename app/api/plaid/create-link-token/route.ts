import { NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from 'plaid'

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

export async function POST() {
  const supabase = await createServerSupabase()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    )
  }

  try {
    const response = await client.linkTokenCreate({
      user: {
        client_user_id: user.id,
      },
      client_name: 'Mansor One',
      products: [Products.Transactions],
      country_codes: ['US' as any],
      language: 'en',
    })

    return NextResponse.json(response.data)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    console.error('Plaid create-link-token error:', {
      message: errorMessage,
    })

    return NextResponse.json(
      { error: 'Unable to create Plaid link token' },
      { status: 500 }
    )
  }
}