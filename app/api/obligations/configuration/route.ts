import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/requireApiUser'
import { requireMutationOrigin } from '@/lib/security/request-origin'
import { createServerSupabase } from '@/lib/supabase/server'

const OWNERS = new Set(['Manuel', 'Soraya', 'household'])
const RECURRENCES = new Set(['monthly', 'quarterly', 'every_3_months', 'annual', 'one_time', 'custom'])

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function amount(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null
}

function day(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 31 ? parsed : null
}

function interval(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 24 ? parsed : 1
}

export async function PATCH(request: Request) {
  const originError = requireMutationOrigin(request)
  if (originError) return originError

  try {
    const { supabase } = await createServerSupabase()
    const auth = await requireApiUser(supabase)
    if (!auth.ok) return auth.response
    const body = await request.json()
    const id = text(body.id)
    const source = text(body.source)
    const owner = text(body.owner)
    const recurrence = text(body.recurrence)?.toLowerCase() || null
    const configuredAmount = amount(body.amount)
    const dueDay = recurrence === 'one_time' ? day(body.dueDay) : day(body.dueDay)

    if (!id || !['obligation', 'scheduled_payment'].includes(source || '')) {
      return NextResponse.json({ error: 'Configuración inválida.' }, { status: 400 })
    }
    if (!owner || !OWNERS.has(owner) || !recurrence || !RECURRENCES.has(recurrence)) {
      return NextResponse.json({ error: 'Responsable o recurrencia inválidos.' }, { status: 400 })
    }
    if (!configuredAmount || (recurrence !== 'one_time' && !dueDay)) {
      return NextResponse.json({ error: 'Completa el monto y el día de vencimiento.' }, { status: 400 })
    }

    const { data: membership, error: membershipError } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('auth_user_id', auth.user.id)
      .eq('active', true)
      .maybeSingle()
    if (membershipError) throw membershipError
    if (!membership?.household_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (source === 'obligation') {
      const paymentMethod = text(body.paymentMethod)
      const confirmDueDayConflict = body.confirmDueDayConflict === true
      if (!paymentMethod) {
        return NextResponse.json({ error: 'Indica la cuenta o método habitual.' }, { status: 400 })
      }
      const { data: existing, error: existingError } = await supabase
        .from('obligations')
        .select('notes')
        .eq('id', id)
        .eq('household_id', membership.household_id)
        .maybeSingle()
      if (existingError) throw existingError
      if (!existing) return NextResponse.json({ error: 'Obligación no encontrada.' }, { status: 404 })
      const confirmationMarker = `contractual_due_day_confirmed:${dueDay}`
      const existingNotes = text(existing.notes)
      const notes = confirmDueDayConflict && !String(existingNotes || '').includes(confirmationMarker)
        ? [existingNotes, confirmationMarker].filter(Boolean).join(' | ')
        : existingNotes
      const { data, error } = await supabase
        .from('obligations')
        .update({
          default_amount: configuredAmount,
          amount: configuredAmount,
          due_day: dueDay,
          owner,
          person: owner,
          frequency: recurrence,
          recurrence,
          payment_method: paymentMethod,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('household_id', membership.household_id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: 'Obligación no encontrada.' }, { status: 404 })
    } else {
      const { data, error } = await supabase
        .from('scheduled_payments')
        .update({
          amount: configuredAmount,
          due_day: dueDay,
          owner,
          recurrence_type: recurrence,
          recurrence_interval: interval(body.recurrenceInterval),
        })
        .eq('id', id)
        .eq('household_id', membership.household_id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: 'Calendario no encontrado.' }, { status: 404 })
    }

    return NextResponse.json({ success: true, generatedPayments: 0 })
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Obligation configuration update failed', error)
    }
    return NextResponse.json({ error: 'No se pudo guardar la configuración.' }, { status: 500 })
  }
}
