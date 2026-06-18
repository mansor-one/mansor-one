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

function getSuggestedCategory(merchant: string, plaidPrimary: string | null) {
  const upperMerchant = merchant.toUpperCase()

  if (
    upperMerchant.includes('MC DONALDS') ||
    upperMerchant.includes('MCDONALDS') ||
    upperMerchant.includes('BURGER KING') ||
    upperMerchant.includes('FIREHOUSE')
  ) {
    return 'Fast Food'
  }

  if (upperMerchant.includes('ECONO')) {
    return 'Supermercado'
  }

  if (
    upperMerchant.includes('WALGREENS') ||
    upperMerchant.includes('FARMACIA')
  ) {
    return 'Farmacia'
  }

  if (
    upperMerchant.includes('FUEL') ||
    upperMerchant.includes('TOTAL SER') ||
    upperMerchant.includes('TO GO STORES') ||
    upperMerchant.includes('JUNITO')
  ) {
    return 'Gasolina'
  }

  if (upperMerchant.includes('COOP LARES')) {
    return 'Deuda - Lares'
  }

  if (upperMerchant.includes('ATH MOVIL PHONE')) {
    return 'Transferencia'
  }

  if (
    upperMerchant.includes('APPLE') ||
    upperMerchant.includes('NINTENDO')
  ) {
    return 'Suscripciones'
  }

  if (upperMerchant.includes('EST MULTIPISO')) {
    return 'Parking'
  }

  if (upperMerchant.includes('LAB CLIN')) {
    return 'Laboratorio'
  }

  if (upperMerchant === 'ATM/POS') {
    return 'Efectivo'
  }

  if (
    upperMerchant.includes('CHECK DEPOSIT') ||
    upperMerchant.includes('INTEREST PAID')
  ) {
    return 'Ingreso'
  }

  if (plaidPrimary === 'ENTERTAINMENT') {
    return 'Entretenimiento'
  }

  if (plaidPrimary === 'ENTERTAINMENT') {
  return 'Entretenimiento'
}
  return 'Revisar'
}

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

    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
      count: 50,
    })

    const transactions = response.data.added || []

    const rows = transactions.map((transaction) => {
      const merchant =
        transaction.merchant_name ||
        transaction.name ||
        'Unknown'

      const plaidPrimary =
        transaction.personal_finance_category?.primary || null

      return {
        user_id: connection.user_id,
        plaid_transaction_id: transaction.transaction_id,
        transaction_date: transaction.date,
        merchant,
        amount: transaction.amount,
        plaid_category: plaidPrimary,
        suggested_category: getSuggestedCategory(merchant, plaidPrimary),
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

    return NextResponse.json({
      imported_count: transactions.length,
    })
  } catch (error) {
    console.error('Plaid sync-imports error:', error)

    return NextResponse.json(
      { error: 'Unable to sync Plaid transactions' },
      { status: 500 }
    )
  }
}