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

export async function POST(request: Request) {
  const body = await request.json()

  if (!body.access_token) {
    return NextResponse.json(
      { error: 'Missing access_token' },
      { status: 400 }
    )
  }

  const response = await client.transactionsSync({
    access_token: body.access_token,
    count: 20,
  })

  return NextResponse.json(response.data)
}