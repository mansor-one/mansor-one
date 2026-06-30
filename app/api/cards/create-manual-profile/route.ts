import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/requireUser'
import { createServerSupabase } from '@/lib/supabase/server'

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function dayValue(value: unknown) {
  const parsed = numberValue(value)
  if (parsed === null) return null

  const day = Math.trunc(parsed)
  return day >= 1 && day <= 31 ? day : null
}

function logDevError(message: string, error: unknown) {
  if (process.env.NODE_ENV === 'production') return

  console.error(message, error)
}

export async function POST(request: Request) {
  try {
    const { supabase } = await createServerSupabase()
    const { user } = await requireUser(supabase)
    const body = await request.json()
    const plaidAccountId = textValue(body.plaidAccountId)

    if (!plaidAccountId) {
      return NextResponse.json(
        { error: 'Invalid Plaid account id' },
        { status: 400 }
      )
    }

    const { data: plaidAccount, error: plaidError } = await supabase
      .from('plaid_accounts')
      .select('id, name, institution_name, type')
      .eq('id', plaidAccountId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (plaidError) throw plaidError

    if (!plaidAccount || plaidAccount.type !== 'credit') {
      return NextResponse.json(
        { error: 'Plaid credit account not found' },
        { status: 404 }
      )
    }

    const ownerId = textValue(body.ownerId)
    const name = textValue(body.name) || plaidAccount.name || 'Credit card'
    const bank = textValue(body.bank) || plaidAccount.institution_name || null

    const { data, error } = await supabase
      .from('credit_cards')
      .insert({
        name,
        bank,
        owner_id: ownerId,
        user_id: user.id,
        plaid_account_id: plaidAccount.id,
        credit_limit: numberValue(body.creditLimit),
        balance: null,
        minimum_payment: numberValue(body.minimumPayment),
        due_day: dayValue(body.dueDay),
        is_active: true,
        card_type: textValue(body.cardType),
        use_case: textValue(body.useCase),
        interest_notes: textValue(body.interestNotes),
        promo_end_date: textValue(body.promoEndDate),
      })
      .select('id')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, cardId: data.id })
  } catch (error) {
    logDevError('Manual card profile create failed', error)

    return NextResponse.json(
      { error: 'Could not create manual card profile' },
      { status: 500 }
    )
  }
}
