import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

const configuration = new Configuration({
  basePath: PlaidEnvironments[
    process.env.PLAID_ENV as keyof typeof PlaidEnvironments
  ],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
})

const client = new PlaidApi(configuration)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const body = await request.json()

  const response = await client.itemPublicTokenExchange({
    public_token: body.public_token,
  })

  const accessToken = response.data.access_token
  const itemId = response.data.item_id

  const { error } = await supabaseAdmin
    .from('plaid_connections')
    .insert({
      item_id: itemId,
      access_token: accessToken,
      institution_name: body.institution_name || 'Unknown',
    })

  if (error) {
  console.log('SUPABASE ERROR:', error)

  return NextResponse.json(
    {
      error: error.message,
      details: error,
      access_token_received: false,
    },
    { status: 500 }
  )
}

  return NextResponse.json({
    item_id: itemId,
    access_token_received: true,
  })
}