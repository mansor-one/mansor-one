import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'
import { decrypt } from '@/lib/security/encryption'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

const plaidClient = new PlaidApi(configuration)

export async function POST() {
  const { data: connection, error: connectionError } = await supabaseAdmin
    .from('plaid_connections')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (connectionError || !connection) {
    return NextResponse.json(
      { error: connectionError?.message || 'No Plaid connection found' },
      { status: 400 }
    )
  }

  const accessToken = decrypt(
    connection.encrypted_access_token,
    connection.token_iv,
    connection.token_auth_tag
  )

  const response = await plaidClient.accountsBalanceGet({
    access_token: accessToken,
  })

  const accounts = response.data.accounts || []

  for (const account of accounts) {
    const { error } = await supabaseAdmin
      .from('plaid_accounts')
      .upsert(
        {
          user_id: connection.user_id,
          plaid_account_id: account.account_id,
          name: account.name,
          type: account.type,
          subtype: account.subtype,
          available_balance: account.balances.available,
          current_balance: account.balances.current,
          currency: account.balances.iso_currency_code,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'plaid_account_id',
        }
      )

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({
    synced_accounts: accounts.length,
  })
}