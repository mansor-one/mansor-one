import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('plaid_accounts')
      .select(
        'id, name, type, subtype, available_balance, current_balance, currency, updated_at'
      )
      .order('name', { ascending: true })

    if (error) {
      console.error('Plaid accounts read error:', error)

      return NextResponse.json(
        { error: 'Could not load Plaid accounts' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      accounts: data || [],
    })
  } catch (error) {
    console.error('Plaid accounts endpoint error:', error)

    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 }
    )
  }
}