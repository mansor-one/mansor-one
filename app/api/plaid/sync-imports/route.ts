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

  const response = await plaidClient.transactionsSync({
    access_token: accessToken,
    count: 50,
  })

  const transactions = response.data.added || []

  for (const transaction of transactions) {
    const merchant =
      transaction.merchant_name ||
      transaction.name ||
      'Unknown'

    const plaidPrimary =
      transaction.personal_finance_category?.primary || null

    const { data: categoryRule } = await supabaseAdmin
      .from('plaid_category_rules')
      .select('*')
      .eq('plaid_primary', plaidPrimary)
      .maybeSingle()

    const suggestedCategory =
      categoryRule?.suggested_category || 'Revisar'

    await supabaseAdmin
      .from('plaid_imports')
      .upsert(
        {
          plaid_transaction_id: transaction.transaction_id,
          transaction_date: transaction.date,
          merchant,
          amount: transaction.amount,
          plaid_category: plaidPrimary,
          suggested_category: suggestedCategory,
          imported: false,
        },
        {
          onConflict: 'plaid_transaction_id',
        }
      )
  }

  return NextResponse.json({
    imported_count: transactions.length,
  })
}