import { requireApiUser } from '@/lib/auth/requireApiUser'
import { createServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { eligibleManualPaymentAccount, eligiblePlaidPaymentAccount } from '@/lib/financial-engine/payment-account-options'
import {
  futureDefaultAmountUpdate,
  paymentCorrectionAuditEvidence,
} from '@/lib/financial-engine/obligation-payment-correction'

function value(input: unknown) {
  return typeof input === 'string' && input.trim() ? input.trim() : null
}

export async function POST(request: Request) {
  return savePaymentConfirmation(request, false)
}

export async function PATCH(request: Request) {
  return savePaymentConfirmation(request, true)
}

async function savePaymentConfirmation(request: Request, correctionOnly: boolean) {
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
    const requestedAmount = Number(body.amount)
    const updateFutureDefault = body.updateFutureDefault === true

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
      .select('id, obligation_id, amount_expected, status')
      .eq('id', obligationInstanceId)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (instanceError) throw instanceError
    if (!instance) return NextResponse.json({ error: 'Obligation not found' }, { status: 404 })
    if (['confirmed', 'closed', 'cancelled'].includes(instance.status)) {
      return NextResponse.json({ error: 'Obligation is already closed' }, { status: 409 })
    }
    const reportedAmount = Number.isFinite(requestedAmount) && requestedAmount > 0
      ? Number(requestedAmount.toFixed(2))
      : Number(instance.amount_expected || 0)
    if (!(reportedAmount > 0)) {
      return NextResponse.json({ error: 'El importe pagado debe ser mayor de cero' }, { status: 400 })
    }

    const confirmedAt = `${confirmationDate.slice(0, 10)}T12:00:00.000Z`
    const { data: existing, error: existingError } = await supabase
      .from('obligation_payment_links')
      .select('id, reported_amount, confirmed_at, payment_method, payment_account_id, payment_account_source, confirmation_note')
      .eq('user_id', auth.user.id)
      .eq('obligation_instance_id', obligationInstanceId)
      .eq('reconciliation_status', 'pending_settlement')
      .is('quick_entry_id', null)
      .is('plaid_import_id', null)
      .maybeSingle()
    if (existingError) throw existingError
    if (correctionOnly && !existing) {
      return NextResponse.json({ error: 'No existe un pago pendiente para corregir' }, { status: 409 })
    }

    let linkId = existing?.id || null
    if (linkId) {
      const { error } = await supabase.from('obligation_payment_links').update({
        reported_amount: reportedAmount,
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
        reported_amount: reportedAmount,
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

    let previousDefaultAmount: number | null = null
    if (updateFutureDefault) {
      const { data: obligation, error: obligationError } = await supabase
        .from('obligations')
        .select('default_amount')
        .eq('id', instance.obligation_id)
        .eq('user_id', auth.user.id)
        .maybeSingle()
      if (obligationError) throw obligationError
      if (!obligation) return NextResponse.json({ error: 'Obligación no encontrada' }, { status: 404 })
      previousDefaultAmount = obligation.default_amount === null
        ? null
        : Number(obligation.default_amount)
      const { error: defaultError } = await supabase.from('obligations').update({
        ...futureDefaultAmountUpdate(reportedAmount),
        updated_at: new Date().toISOString(),
      }).eq('id', instance.obligation_id).eq('user_id', auth.user.id)
      if (defaultError) throw defaultError
    }

    if (!existing) {
      const { error: eventError } = await supabase.from('obligation_reconciliation_events').insert({
        user_id: auth.user.id,
        obligation_instance_id: obligationInstanceId,
        payment_link_id: linkId,
        event_type: 'manual_confirmation',
        from_status: instance.status,
        to_status: 'pending_settlement',
        evidence: {
          reported_amount: reportedAmount,
          confirmation_date: confirmationDate.slice(0, 10),
          payment_method: paymentMethod,
          payment_account_source: paymentAccountSource,
          payment_account_selected: Boolean(paymentAccountId),
          note_present: Boolean(note),
          future_default_updated: updateFutureDefault,
        },
      })
      if (eventError) throw eventError
    } else {
      const previousDate = existing.confirmed_at
        ? String(existing.confirmed_at).slice(0, 10)
        : null
      const { error: eventError } = await supabase.from('obligation_reconciliation_events').insert({
        user_id: auth.user.id,
        obligation_instance_id: obligationInstanceId,
        payment_link_id: linkId,
        event_type: 'manual_correction',
        from_status: 'pending_settlement',
        to_status: 'pending_settlement',
        evidence: paymentCorrectionAuditEvidence({
          previous: {
            reportedAmount: existing.reported_amount === null
              ? Number(instance.amount_expected || 0)
              : Number(existing.reported_amount),
            confirmationDate: previousDate,
            paymentMethod: existing.payment_method,
            paymentAccountId: existing.payment_account_id,
            paymentAccountSource: existing.payment_account_source,
            notePresent: Boolean(existing.confirmation_note),
          },
          corrected: {
            reportedAmount,
            confirmationDate: confirmationDate.slice(0, 10),
            paymentMethod,
            paymentAccountId,
            paymentAccountSource,
            notePresent: Boolean(note),
          },
          futureDefault: updateFutureDefault
            ? { previous: previousDefaultAmount, corrected: reportedAmount }
            : null,
        }),
      })
      if (eventError) throw eventError
    }

    return NextResponse.json({
      success: true,
      lifecycleState: 'pending_settlement',
      reportedAmount,
      futureDefaultUpdated: updateFutureDefault,
    })
  } catch (error) {
    console.error('Manual obligation confirmation failed:', error)
    return NextResponse.json({ error: 'Could not confirm this payment' }, { status: 500 })
  }
}
