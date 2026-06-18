import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (!body?.id || typeof body.id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid transaction id' },
        { status: 400 }
      )
    }

    const { data: item, error: itemError } = await supabaseAdmin
      .from('plaid_imports')
      .select('*')
      .eq('id', body.id)
      .single()

    if (itemError || !item) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    let category = item.suggested_category || 'Revisar'

    if (category === 'Transferencia') {
      category =
        Number(item.amount) < 0
          ? 'Transferencia Enviada'
          : 'Transferencia Recibida'
    }

    const { error: entryError } = await supabaseAdmin
      .from('quick_entries')
      .insert({
        entry_date: item.transaction_date,
        description: item.merchant,
        amount: Number(item.amount || 0),
        entry_type: Number(item.amount) < 0 ? 'income' : 'expense',
        owner: 'Manuel',
        category,
        source: 'plaid',
        plaid_transaction_id: item.plaid_transaction_id,
        user_id: item.user_id,
      })

    if (entryError) {
      return NextResponse.json(
        { error: 'Could not import transaction' },
        { status: 500 }
      )
    }

    const { error: updateError } = await supabaseAdmin
      .from('plaid_imports')
      .update({ imported: true })
      .eq('id', item.id)

    if (updateError) {
      return NextResponse.json(
        { error: 'Transaction imported but status update failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 }
    )
  }
}