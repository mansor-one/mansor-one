import { NextResponse } from 'next/server'
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV as keyof typeof PlaidEnvironments],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
})

const client = new PlaidApi(configuration)

export async function POST(request: Request) {
  const body = await request.json()

  const response = await client.itemPublicTokenExchange({
    public_token: body.public_token,
  })

  return NextResponse.json({
    item_id: response.data.item_id,
    access_token_received: true,
  })
}