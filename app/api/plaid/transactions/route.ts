import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/requireUser'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET() {
  try {
    const { supabase } = await createServerSupabase()
    const { user } = await requireUser(supabase)

    const { data, error } = await supabase
      .from('plaid_imports')
      .select(
        'id, plaid_transaction_id, transaction_date, merchant, amount, plaid_category, suggested_category, imported'
      )
      .eq('user_id', user.id)
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
