import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'
import { decrypt } from '@/lib/security/encryption'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

const plaidClient = new PlaidApi(configuration)

export async function POST() {
  try {
    const { data: connection, error: connectionError } = await supabaseAdmin
      .from('plaid_connections')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (connectionError || !connection) {
      return NextResponse.json(
        { error: 'No Plaid connection found' },
        { status: 404 }
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

    const rows = accounts.map((account) => ({
      user_id: connection.user_id,
      plaid_account_id: account.account_id,
      name: account.name,
      type: account.type,
      subtype: account.subtype,
      available_balance: account.balances.available,
      current_balance: account.balances.current,
      currency: account.balances.iso_currency_code,
      updated_at: new Date().toISOString(),
    }))

    const { error: upsertError } = await supabaseAdmin
      .from('plaid_accounts')
      .upsert(rows, {
        onConflict: 'plaid_account_id',
      })

    if (upsertError) {
      console.error('Plaid accounts upsert error:', upsertError)

      return NextResponse.json(
        { error: 'Could not sync Plaid accounts' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      synced_accounts: accounts.length,
    })
  } catch (error) {
    console.error('Plaid sync-accounts error:', error)

    return NextResponse.json(
      { error: 'Unable to sync Plaid accounts' },
      { status: 500 }
    )
  }
}