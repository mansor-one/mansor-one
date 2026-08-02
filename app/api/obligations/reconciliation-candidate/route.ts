import { requireApiUser } from '@/lib/auth/requireApiUser'
import { createServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireMutationOrigin } from '@/lib/security/request-origin'
import {
  classifyDebtReductionCredit,
  obligationEvidenceCoverage,
} from '@/lib/financial-engine/debt-reduction-credit'

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function POST(request: Request) {
  try {
    const originError = requireMutationOrigin(request)
    if (originError) return originError
    const { supabase } = await createServerSupabase()
    const auth = await requireApiUser(supabase)
    if (!auth.ok) return auth.response
    const body = await request.json()
    const paymentLinkId = text(body.paymentLinkId)
    const action = text(body.action)
    if (!paymentLinkId || !['reject', 'confirm'].includes(action || '')) {
      return NextResponse.json({ error: 'La decisión no es válida' }, { status: 400 })
    }

    const { data: link, error: linkError } = await supabase
      .from('obligation_payment_links')
      .select('id, obligation_instance_id, plaid_import_id, reconciliation_status, confidence, obligation_instances(id, status, amount_expected, obligation_id, obligations(default_amount)), plaid_imports(id, merchant, amount, account_type, account_subtype, suggested_category, plaid_category)')
      .eq('id', paymentLinkId)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (linkError) throw linkError
    if (!link || !link.plaid_import_id) {
      return NextResponse.json({ error: 'Candidato no encontrado' }, { status: 404 })
    }
    if (!['detected', 'rejected'].includes(link.reconciliation_status)) {
      return NextResponse.json({ error: 'El candidato ya fue resuelto' }, { status: 409 })
    }

    const instance = Array.isArray(link.obligation_instances)
      ? link.obligation_instances[0]
      : link.obligation_instances
    const transaction = Array.isArray(link.plaid_imports)
      ? link.plaid_imports[0]
      : link.plaid_imports
    if (!instance || !transaction) {
      return NextResponse.json({ error: 'Falta evidencia para resolver el candidato' }, { status: 409 })
    }

    if (action === 'reject') {
      const { error } = await supabase.from('obligation_payment_links').update({
        reconciliation_status: 'rejected',
        updated_at: new Date().toISOString(),
      }).eq('id', link.id).eq('user_id', auth.user.id)
      if (error) throw error
      const { error: eventError } = await supabase.from('obligation_reconciliation_events').insert({
        user_id: auth.user.id,
        obligation_instance_id: link.obligation_instance_id,
        payment_link_id: link.id,
        event_type: 'rejected',
        from_status: link.reconciliation_status,
        to_status: 'rejected',
        confidence: link.confidence,
        evidence: { transaction_source: 'plaid_imports', transaction_id: link.plaid_import_id },
      })
      if (eventError) throw eventError
      return NextResponse.json({ success: true, status: 'rejected' })
    }

    const { data: pendingLink, error: pendingError } = await supabase
      .from('obligation_payment_links')
      .select('reported_amount')
      .eq('user_id', auth.user.id)
      .eq('obligation_instance_id', link.obligation_instance_id)
      .eq('reconciliation_status', 'pending_settlement')
      .is('plaid_import_id', null)
      .maybeSingle()
    if (pendingError) throw pendingError
    const obligation = Array.isArray(instance.obligations)
      ? instance.obligations[0]
      : instance.obligations
    const expectedAmount = Number(
      pendingLink?.reported_amount ?? instance.amount_expected ?? obligation?.default_amount ?? 0
    )
    const transactionAmount = Math.abs(Number(transaction.amount || 0))
    const debtReductionCredit = classifyDebtReductionCredit({
      description: transaction.merchant,
      amount: Number(transaction.amount || 0),
      accountType: transaction.account_type,
      accountSubtype: transaction.account_subtype,
      category: transaction.suggested_category || transaction.plaid_category,
    })
    const exactAmount = Math.abs(transactionAmount - expectedAmount) <= 0.009
    if (!(expectedAmount > 0) || (!exactAmount && !debtReductionCredit)) {
      return NextResponse.json({
        error: 'El importe del candidato no coincide exactamente con el pago reportado',
      }, { status: 409 })
    }

    const now = new Date().toISOString()
    const { error: reconcileError } = await supabase.from('obligation_payment_links').update({
      reconciliation_status: 'reconciled',
      reconciled_at: now,
      updated_at: now,
    }).eq('id', link.id).eq('user_id', auth.user.id)
    if (reconcileError) throw reconcileError

    const { data: reconciledLinks, error: reconciledLinksError } = await supabase
      .from('obligation_payment_links')
      .select('plaid_imports(amount)')
      .eq('user_id', auth.user.id)
      .eq('obligation_instance_id', link.obligation_instance_id)
      .eq('reconciliation_status', 'reconciled')
      .not('plaid_import_id', 'is', null)
    if (reconciledLinksError) throw reconciledLinksError
    const evidenceAmounts = (reconciledLinks || []).map((item) => {
      const imported = Array.isArray(item.plaid_imports)
        ? item.plaid_imports[0]
        : item.plaid_imports
      return Number(imported?.amount || 0)
    })
    const {
      totalEvidenceAmount,
      reconciledAmount,
      obligationSatisfied,
      excessUnallocated,
    } =
      obligationEvidenceCoverage(expectedAmount, evidenceAmounts)

    if (obligationSatisfied) {
      const { error: instanceError } = await supabase.from('obligation_instances').update({
        status: 'confirmed',
        updated_at: now,
      }).eq('id', instance.id).eq('user_id', auth.user.id).in('status', ['pending', 'initiated'])
      if (instanceError) throw instanceError
    }
    const { error: eventError } = await supabase.from('obligation_reconciliation_events').insert({
      user_id: auth.user.id,
      obligation_instance_id: link.obligation_instance_id,
      payment_link_id: link.id,
      event_type: 'manual_reconciled',
      from_status: instance.status,
      to_status: obligationSatisfied ? 'reconciled' : 'partially_reconciled',
      confidence: link.confidence,
      evidence: {
        transaction_source: 'plaid_imports',
        transaction_id: link.plaid_import_id,
        evidence_kind: debtReductionCredit?.kind || 'payment',
        evidence_amount: transactionAmount,
        total_evidence_amount: totalEvidenceAmount,
        reconciled_amount: reconciledAmount,
        expected_amount: expectedAmount,
        obligation_satisfied: obligationSatisfied,
        excess_unallocated: excessUnallocated,
      },
    })
    if (eventError) throw eventError
    return NextResponse.json({
      success: true,
      status: 'reconciled',
      obligationSatisfied,
      reconciledAmount,
      excessUnallocated,
    })
  } catch (error) {
    console.error('Obligation candidate decision failed:', error)
    return NextResponse.json({ error: 'No se pudo guardar la decisión' }, { status: 500 })
  }
}
