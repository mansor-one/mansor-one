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

export async function POST() {
  const response = await client.linkTokenCreate({
    user: {
      client_user_id: 'mansor-one-user',
    },
    client_name: 'Mansor One',
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
  })

  return NextResponse.json(response.data)
}