import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
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

    const { data: connections, error: connectionError } = await supabaseAdmin
      .from('plaid_connections')
      .select('*')
      .eq('user_id', user.id)
      .not('encrypted_access_token', 'is', null)
      .order('created_at', { ascending: false })

    if (connectionError) {
      const errorMessage =
        connectionError instanceof Error
          ? connectionError.message
          : String(connectionError)
      console.error('Plaid connection lookup error:', {
        message: errorMessage,
      })

      return NextResponse.json(
        { error: 'Could not load Plaid connections' },
        { status: 500 }
      )
    }

    if (!connections || connections.length === 0) {
      return NextResponse.json(
        { error: 'No Plaid connection found' },
        { status: 404 }
      )
    }

    let syncedAccounts = 0
    const failedConnections: any[] = []

    for (const connection of connections) {
      try {
        const accessToken = decrypt(
          connection.encrypted_access_token,
          connection.token_iv,
          connection.token_auth_tag
        )

        const response = await plaidClient.accountsBalanceGet({
          access_token: accessToken,
        })

        const accounts = response.data.accounts || []

        const rows = accounts.map((account) => {
          console.log('Syncing Plaid account', {
            name: account.name,
            institution_name: connection.institution_name,
            connection_id: connection.id,
          })

          return {
            user_id: user.id,
            connection_id: connection.id,
            institution_name: connection.institution_name || 'Unknown',
            plaid_account_id: account.account_id,
            name: account.name,
            type: account.type,
            subtype: account.subtype,
            available_balance: account.balances.available,
            current_balance: account.balances.current,
            currency: account.balances.iso_currency_code,
            updated_at: new Date().toISOString(),
          }
        })

        console.log('Connection', {
          id: connection.id,
          institution_name: connection.institution_name,
        })
        console.log('Rows sample', rows[0])

        if (rows.length > 0) {
          const { error: upsertError } = await supabaseAdmin
            .from('plaid_accounts')
            .upsert(rows, {
              onConflict: 'plaid_account_id',
            })

          console.log('Upsert result', {
            error: upsertError,
            rows: rows.length,
          })

          if (upsertError) {
            throw upsertError
          }
        }

        syncedAccounts += accounts.length
      } catch (error: any) {
        failedConnections.push({
          id: connection.id,
          institution_name: connection.institution_name,
          error_code: error?.response?.data?.error_code || 'UNKNOWN_ERROR',
          error_message:
            error?.response?.data?.error_message ||
            error?.message ||
            'Unknown Plaid sync error',
        })
      }
    }

    return NextResponse.json({
      synced_accounts: syncedAccounts,
      failed_connections: failedConnections,
    })
  } catch (error) {
    console.error('Plaid sync-accounts error:', error)

    return NextResponse.json(
      { error: 'Unable to sync Plaid accounts' },
      { status: 500 }
    )
  }
}
