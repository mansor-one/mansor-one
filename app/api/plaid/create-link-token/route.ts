import { NextResponse } from 'next/server'
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
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
  try {
    const response = await client.linkTokenCreate({
      user: {
        client_user_id: crypto.randomUUID(),
      },
      client_name: 'Mansor One',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    })

    return NextResponse.json(response.data)
  } catch (error) {
    console.error('Plaid create-link-token error:', error)

    return NextResponse.json(
      {
        error: 'Unable to create Plaid link token',
      },
      {
        status: 500,
      }
    )
  }
}