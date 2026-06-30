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

function lastFourValue(value: unknown) {
  const text = textValue(value)
  if (!text) return null

  const digits = text.replace(/\D/g, '')
  return digits ? digits.slice(-4) : null
}

function booleanValue(value: unknown) {
  return value === true
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
    const cardId = textValue(body.cardId)

    if (!cardId) {
      return NextResponse.json({ error: 'Invalid card id' }, { status: 400 })
    }

    const ownerId = textValue(body.ownerId)
    if (ownerId) {
      const { data: owner, error: ownerError } = await supabase
        .from('people')
        .select('id')
        .eq('id', ownerId)
        .maybeSingle()

      if (ownerError) throw ownerError

      if (!owner) {
        return NextResponse.json({ error: 'Invalid owner' }, { status: 400 })
      }
    }

    const updates = {
      name: textValue(body.name),
      owner_id: ownerId,
      is_active: booleanValue(body.isActive),
      credit_limit: numberValue(body.creditLimit),
      minimum_payment: numberValue(body.minimumPayment),
      due_day: dayValue(body.dueDay),
      cutoff_day: dayValue(body.cutoffDay),
      regular_apr: numberValue(body.regularApr),
      promo_apr: numberValue(body.promoApr),
      autopay_enabled: booleanValue(body.autopayEnabled),
      autopay_account_label: textValue(body.autopayAccountLabel),
      payment_account_notes: textValue(body.paymentAccountNotes),
      manual_last4: lastFourValue(body.manualLast4),
      interest_notes: textValue(body.interestNotes),
      promo_end_date: textValue(body.promoEndDate),
      use_case: textValue(body.useCase),
      card_type: textValue(body.cardType),
    }

    if (!updates.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('credit_cards')
      .update(updates)
      .eq('id', cardId)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle()

    if (error) throw error

    if (!data) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, cardId: data.id })
  } catch (error) {
    logDevError('Card update failed', error)

    return NextResponse.json(
      { error: 'Could not update card profile' },
      { status: 500 }
    )
  }
}
