import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const body = await request.json()

  const { data: item, error: itemError } = await supabaseAdmin
    .from('plaid_imports')
    .select('*')
    .eq('id', body.id)
    .single()

  if (itemError || !item) {
    return NextResponse.json(
      {
        error: itemError?.message || 'Transaction not found',
      },
      { status: 400 }
    )
  }

  const { error: entryError } = await supabaseAdmin
    .from('quick_entries')
    .insert({
      description: item.merchant,
      amount: Math.abs(Number(item.amount || 0)),
      entry_type: Number(item.amount) < 0 ? 'income' : 'expense',
      owner: 'Manuel',
      category: item.suggested_category || 'Revisar',
      source: 'plaid',
      plaid_transaction_id: item.plaid_transaction_id,
    })

  if (entryError) {
    return NextResponse.json(
      {
        error: entryError.message,
      },
      { status: 500 }
    )
  }

  const { error: updateError } = await supabaseAdmin
    .from('plaid_imports')
    .update({
      imported: true,
    })
    .eq('id', item.id)

  if (updateError) {
    return NextResponse.json(
      {
        error: updateError.message,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
  })
}