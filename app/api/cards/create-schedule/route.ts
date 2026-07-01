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
    const cardId = textValue(body.cardId)
    const name = textValue(body.name)
    const dueDay = dayValue(body.dueDay)
    const amount = numberValue(body.amount)
    const paymentAccount = textValue(body.paymentAccount)

    if (!cardId || !name || !dueDay) {
      return NextResponse.json(
        { error: 'Card, payment name, and due day are required' },
        { status: 400 }
      )
    }

    const { data: card, error: cardError } = await supabase
      .from('credit_cards')
      .select('id, name, owner_id')
      .eq('id', cardId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (cardError) throw cardError

    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    const { data: existingSchedule, error: existingScheduleError } =
      await supabase
        .from('scheduled_payments')
        .select('id')
        .eq('credit_card_id', card.id)
        .eq('is_active', true)
        .maybeSingle()

    if (existingScheduleError) throw existingScheduleError

    if (existingSchedule) {
      const { error: linkError } = await supabase
        .from('credit_cards')
        .update({ scheduled_payment_id: existingSchedule.id })
        .eq('id', card.id)
        .eq('user_id', user.id)

      if (linkError) throw linkError

      return NextResponse.json({
        success: true,
        scheduledPaymentId: existingSchedule.id,
        alreadyExists: true,
      })
    }

    const { data, error } = await supabase
      .from('scheduled_payments')
      .insert({
        name,
        amount,
        due_day: dueDay,
        owner: null,
        category: 'Credit Card Payment',
        is_active: true,
        recurrence_type: body.recurringMonthly === true ? 'monthly' : null,
        active_months: body.recurringMonthly === true ? null : null,
        credit_card_id: card.id,
        user_id: user.id,
        notes: paymentAccount
          ? `Payment account: ${paymentAccount}`
          : 'Created from Cards edit mode.',
      })
      .select('id')
      .single()

    if (error) throw error

    const { error: linkError } = await supabase
      .from('credit_cards')
      .update({ scheduled_payment_id: data.id })
      .eq('id', card.id)
      .eq('user_id', user.id)

    if (linkError) throw linkError

    return NextResponse.json({ success: true, scheduledPaymentId: data.id })
  } catch (error) {
    logDevError('Card schedule create failed', error)

    return NextResponse.json(
      { error: 'Could not create payment schedule' },
      { status: 500 }
    )
  }
}
