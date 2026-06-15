import { NextResponse } from 'next/server'
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

let sandboxAccessToken = ''

export async function POST(request: Request) {
  const body = await request.json()

  if (body.access_token) {
    sandboxAccessToken = body.access_token
  }

  if (!sandboxAccessToken) {
    return NextResponse.json(
      { error: 'No access token available yet.' },
      { status: 400 }
    )
  }

  const response = await client.accountsBalanceGet({
    access_token: sandboxAccessToken,
  })

  return NextResponse.json(response.data)
}