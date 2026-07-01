import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/requireUser'
import { getCardsSummary } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
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
    const cardProfileId = textValue(body.cardProfileId)
    const paymentInstanceId = textValue(body.paymentInstanceId)

    if (!cardProfileId || !paymentInstanceId) {
      return NextResponse.json(
        { error: 'Card and payment are required' },
        { status: 400 }
      )
    }

    const summary = await getCardsSummary(supabase, user.id)
    const card = summary.cards.find((item) => item.id === cardProfileId)

    if (!card || card.currentPaymentInstanceId !== paymentInstanceId) {
      return NextResponse.json(
        { error: 'Payment is not linked to this card' },
        { status: 404 }
      )
    }

    const { data: payment, error: paymentError } = await supabase
      .from('payment_instances')
      .select(
        `
        id,
        notes,
        scheduled_payment_id,
        scheduled_payments (
          id,
          user_id,
          credit_card_id,
          credit_cards (
            id,
            user_id
          )
        )
      `
      )
      .eq('id', paymentInstanceId)
      .maybeSingle()

    if (paymentError) throw paymentError

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    const schedule = Array.isArray(payment.scheduled_payments)
      ? payment.scheduled_payments[0]
      : payment.scheduled_payments
    const linkedCard = Array.isArray(schedule?.credit_cards)
      ? schedule?.credit_cards[0]
      : schedule?.credit_cards
    const ownsPayment =
      schedule?.user_id === user.id || linkedCard?.user_id === user.id

    if (!ownsPayment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    const note = `Manual confirmation from Cards on ${new Date()
      .toISOString()
      .slice(0, 10)}.`
    const notes = [payment.notes, note].filter(Boolean).join(' | ')

    const { error: updateError } = await supabase
      .from('payment_instances')
      .update({
        status: 'confirmed',
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentInstanceId)

    if (updateError) throw updateError

    return NextResponse.json({ success: true, paymentInstanceId })
  } catch (error) {
    logDevError('Card payment confirmation failed', error)

    return NextResponse.json(
      { error: 'Could not confirm payment' },
      { status: 500 }
    )
  }
}
