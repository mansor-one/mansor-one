import { requireApiUser } from '@/lib/auth/requireApiUser'
import { createServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { eligibleManualPaymentAccount, eligiblePlaidPaymentAccount } from '@/lib/financial-engine/payment-account-options'

function value(input: unknown) {
  return typeof input === 'string' && input.trim() ? input.trim() : null
}

export async function POST(request: Request) {
  try {
    const { supabase } = await createServerSupabase()
    const auth = await requireApiUser(supabase)
    if (!auth.ok) return auth.response
    const body = await request.json()
    const obligationInstanceId = value(body.obligationInstanceId)
    const paymentMethod = value(body.paymentMethod)
    const paymentAccountId = value(body.paymentAccountId)
    const paymentAccountSource = value(body.paymentAccountSource)
    const note = value(body.note)
    const confirmationDate = value(body.confirmationDate) || new Date().toISOString().slice(0, 10)

    if (!obligationInstanceId || !paymentMethod || !paymentAccountSource) {
      return NextResponse.json({ error: 'La obligación y el método de pago son requeridos' }, { status: 400 })
    }
    if (!['plaid_account', 'manual_account', 'cash', 'other'].includes(paymentAccountSource)) {
      return NextResponse.json({ error: 'La fuente de la cuenta no es válida' }, { status: 400 })
    }
    if (['plaid_account', 'manual_account'].includes(paymentAccountSource) && !paymentAccountId) {
      return NextResponse.json({ error: 'Selecciona una cuenta de pago' }, { status: 400 })
    }

    if (paymentAccountId && paymentAccountSource === 'plaid_account') {
      const { data } = await supabase.from('plaid_accounts').select('*').eq('id', paymentAccountId)
        .eq('user_id', auth.user.id).maybeSingle()
      if (!data || !eligiblePlaidPaymentAccount(data)) return NextResponse.json({ error: 'La cuenta de pago no es elegible' }, { status: 400 })
    }
    if (paymentAccountId && paymentAccountSource === 'manual_account') {
      const { data } = await supabase.from('accounts').select('*').eq('id', paymentAccountId)
        .eq('user_id', auth.user.id).maybeSingle()
      if (!data || !eligibleManualPaymentAccount(data)) return NextResponse.json({ error: 'La cuenta de pago no es elegible' }, { status: 400 })
    }

    const { data: instance, error: instanceError } = await supabase
      .from('obligation_instances')
      .select('id, status')
      .eq('id', obligationInstanceId)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (instanceError) throw instanceError
    if (!instance) return NextResponse.json({ error: 'Obligation not found' }, { status: 404 })
    if (['confirmed', 'closed', 'cancelled'].includes(instance.status)) {
      return NextResponse.json({ error: 'Obligation is already closed' }, { status: 409 })
    }

    const confirmedAt = `${confirmationDate.slice(0, 10)}T12:00:00.000Z`
    const { data: existing, error: existingError } = await supabase
      .from('obligation_payment_links')
      .select('id')
      .eq('user_id', auth.user.id)
      .eq('obligation_instance_id', obligationInstanceId)
      .eq('reconciliation_status', 'pending_settlement')
      .is('quick_entry_id', null)
      .is('plaid_import_id', null)
      .maybeSingle()
    if (existingError) throw existingError

    let linkId = existing?.id || null
    if (linkId) {
      const { error } = await supabase.from('obligation_payment_links').update({
        confirmed_at: confirmedAt,
        payment_method: paymentMethod,
        payment_account_id: paymentAccountId,
        payment_account_source: paymentAccountSource,
        confirmation_note: note,
        updated_at: new Date().toISOString(),
      }).eq('id', linkId).eq('user_id', auth.user.id)
      if (error) throw error
    } else {
      const { data, error } = await supabase.from('obligation_payment_links').insert({
        user_id: auth.user.id,
        obligation_instance_id: obligationInstanceId,
        link_source: 'manual',
        reconciliation_status: 'pending_settlement',
        confirmed_at: confirmedAt,
        payment_method: paymentMethod,
        payment_account_id: paymentAccountId,
        payment_account_source: paymentAccountSource,
        confirmation_note: note,
        notes: 'User confirmed this obligation was paid; awaiting settlement evidence.',
      }).select('id').single()
      if (error) throw error
      linkId = data.id
    }

    const { error: updateError } = await supabase.from('obligation_instances').update({
      status: 'initiated',
      updated_at: confirmedAt,
    }).eq('id', obligationInstanceId).eq('user_id', auth.user.id)
    if (updateError) throw updateError

    if (!existing) {
      const { error: eventError } = await supabase.from('obligation_reconciliation_events').insert({
        user_id: auth.user.id,
        obligation_instance_id: obligationInstanceId,
        payment_link_id: linkId,
        event_type: 'manual_confirmation',
        from_status: instance.status,
        to_status: 'pending_settlement',
        evidence: { confirmation_date: confirmationDate.slice(0, 10), payment_method: paymentMethod, payment_account_id: paymentAccountId, payment_account_source: paymentAccountSource, note },
      })
      if (eventError) throw eventError
    }

    return NextResponse.json({ success: true, lifecycleState: 'pending_settlement' })
  } catch (error) {
    console.error('Manual obligation confirmation failed:', error)
    return NextResponse.json({ error: 'Could not confirm this payment' }, { status: 500 })
  }
}
