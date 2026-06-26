import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET() {
  try {
    const { supabase } = await createServerSupabase()
    const { user } = await requireUser(supabase)

    const { data, error } = await supabase
      .from('plaid_accounts')
      .select(
        'id, name, type, subtype, available_balance, current_balance, currency, updated_at'
      )
      .eq('user_id', user.id)
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
