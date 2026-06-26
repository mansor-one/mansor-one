import { categorizeTransaction } from '@/lib/financial-engine/categorizeTransaction'
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
    const { data: connections, error: connectionsError } =
      await supabaseAdmin
        .from('plaid_connections')
        .select('*')
        .order('created_at', { ascending: false })

    if (connectionsError || !connections || connections.length === 0) {
      return NextResponse.json(
        { error: 'No Plaid connections found' },
        { status: 404 }
      )
    }

    let totalImported = 0

    for (const connection of connections) {
      const accessToken = decrypt(
        connection.encrypted_access_token,
        connection.token_iv,
        connection.token_auth_tag
      )

  let response

try {
  response = await plaidClient.transactionsSync({
    access_token: accessToken,
    count: 50,
  })
} catch (error: any) {
  console.error(
    'Plaid connection skipped:',
    connection.institution_name,
    error?.response?.data?.error_code || error?.message
  )
  continue
}

      const transactions = response.data.added || []
      totalImported += transactions.length

      const { data: plaidAccounts } = await supabaseAdmin
        .from('plaid_accounts')
        .select('*')
        .eq('connection_id', connection.id)

      const accountsByPlaidId = new Map(
        (plaidAccounts || []).map((account: any) => [
          account.plaid_account_id,
          account,
        ])
      )

      const rows = transactions.map((transaction) => {
        const merchant =
          transaction.merchant_name ||
          transaction.name ||
          'Unknown'

        const plaidPrimary =
          transaction.personal_finance_category?.primary || null

        const account = accountsByPlaidId.get(transaction.account_id)

        return {
          user_id: connection.user_id,
          plaid_transaction_id: transaction.transaction_id,
          plaid_account_id: transaction.account_id,
          account_name: account?.name || null,
          institution_name:
            account?.institution_name ||
            connection.institution_name ||
            null,
          account_type: account?.type || null,
          account_subtype: account?.subtype || null,
          account_mask: null,
          transaction_date: transaction.date,
          merchant,
          amount: transaction.amount,
          plaid_category: plaidPrimary,
          suggested_category: categorizeTransaction(merchant, plaidPrimary),
          imported: false,
        }
      })

      if (rows.length > 0) {
        const { error: upsertError } = await supabaseAdmin
          .from('plaid_imports')
          .upsert(rows, {
            onConflict: 'plaid_transaction_id',
          })

        if (upsertError) {
          console.error('Plaid imports upsert error:', upsertError)

          return NextResponse.json(
            { error: 'Could not sync Plaid transactions' },
            { status: 500 }
          )
        }
      }
    }

    return NextResponse.json({
      imported_count: totalImported,
    })
  } catch (error) {
    console.error('Plaid sync-imports error:', error)

    return NextResponse.json(
      { error: 'Unable to sync Plaid transactions' },
      { status: 500 }
    )
  }
}