import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('plaid_imports')
      .select(
        'id, plaid_transaction_id, transaction_date, merchant, amount, plaid_category, suggested_category, imported'
      )
      .order('transaction_date', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Plaid transactions read error:', error)

      return NextResponse.json(
        { error: 'Could not load Plaid transactions' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      transactions: data || [],
    })
  } catch (error) {
    console.error('Plaid transactions endpoint error:', error)

    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 }
    )
  }
}