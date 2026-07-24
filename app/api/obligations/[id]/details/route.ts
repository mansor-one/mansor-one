import { requireApiUser } from '@/lib/auth/requireApiUser'
import { paymentAccountOptions, strongPaymentAccountSuggestion } from '@/lib/financial-engine/payment-account-options'
import { obligationPaymentEditState } from '@/lib/financial-engine/obligation-payment-edit-state'
import { createServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const { supabase } = await createServerSupabase()
    const auth = await requireApiUser(supabase)
    if (!auth.ok) return auth.response

    const { data: instance, error } = await supabase.from('obligation_instances').select('*')
      .eq('id', id).eq('user_id', auth.user.id).maybeSingle()
    if (error) throw error
    if (!instance) return NextResponse.json({ error: 'Obligación no encontrada' }, { status: 404 })

    const [obligationResult, providerResult, linksResult, eventsResult, plaidResult, manualResult] = await Promise.all([
      supabase.from('obligations').select('*').eq('id', instance.obligation_id).eq('user_id', auth.user.id).maybeSingle(),
      instance.provider_id
        ? supabase.from('obligation_providers').select('*').eq('id', instance.provider_id).eq('user_id', auth.user.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from('obligation_payment_links').select('*, plaid_imports(id, merchant, amount, transaction_date, institution_name, account_name)').eq('obligation_instance_id', id).eq('user_id', auth.user.id).order('created_at', { ascending: false }),
      supabase.from('obligation_reconciliation_events').select('*').eq('obligation_instance_id', id).eq('user_id', auth.user.id).order('occurred_at', { ascending: false }),
      supabase.from('plaid_accounts').select('*').eq('user_id', auth.user.id),
      supabase.from('accounts').select('*').eq('user_id', auth.user.id),
    ])
    for (const result of [obligationResult, providerResult, linksResult, eventsResult, plaidResult, manualResult]) {
      if (result.error) throw result.error
    }

    const obligation = obligationResult.data
    const name = obligation?.name || ''
    const [scheduleResult, cardResult, liabilityResult, priorLinksResult] = await Promise.all([
      supabase.from('scheduled_payments').select('*').eq('user_id', auth.user.id).ilike('name', name).limit(1).maybeSingle(),
      supabase.from('credit_cards').select('*').eq('user_id', auth.user.id).ilike('name', name).limit(1).maybeSingle(),
      supabase.from('liabilities').select('*').ilike('name', name).limit(1).maybeSingle(),
      obligation?.id
        ? supabase.from('obligation_payment_links').select('payment_account_id, confirmed_at, obligation_instances!inner(obligation_id)')
            .eq('user_id', auth.user.id).eq('obligation_instances.obligation_id', obligation.id)
            .not('payment_account_id', 'is', null).order('confirmed_at', { ascending: false }).limit(3)
        : Promise.resolve({ data: [], error: null }),
    ])
    const options = paymentAccountOptions(plaidResult.data || [], manualResult.data || [])
    const links = linksResult.data || []
    const detectedLink = links.find((link) => link.plaid_import_id)
    let detectedAccountId: string | null = null
    if (detectedLink?.plaid_import_id) {
      const { data: imported } = await supabase.from('plaid_imports').select('plaid_account_id')
        .eq('id', detectedLink.plaid_import_id).eq('user_id', auth.user.id).maybeSingle()
      if (imported?.plaid_account_id) {
        detectedAccountId = options.find((option) => option.source === 'plaid_account' &&
          (plaidResult.data || []).some((account) => account.id === option.id && account.plaid_account_id === imported.plaid_account_id))?.id || null
      }
    }
    const suggestion = strongPaymentAccountSuggestion({
      detectedAccountId,
      priorAccountIds: (priorLinksResult.data || []).map((link) => link.payment_account_id).filter(Boolean),
    })

    const linkedPlaidAccount = cardResult.data?.plaid_account_id
      ? (plaidResult.data || []).find((account) => account.id === cardResult.data.plaid_account_id) || null
      : null
    const latestLink = links[0] || null
    const paymentState = obligationPaymentEditState({ instance, obligation, paymentLinks: links })
    const missing = [
      Number(instance.amount_expected || 0) <= 0 ? 'Monto' : null,
      !cardResult.data?.regular_apr && !liabilityResult.data?.apr ? 'APR' : null,
      !instance.effective_due_date ? 'Fecha de vencimiento' : null,
      !obligation?.grace_period_days && !scheduleResult.data?.grace_day ? 'Fecha límite de gracia' : null,
      !latestLink?.payment_account_id && !obligation?.payment_method ? 'Cuenta de pago' : null,
      !cardResult.data?.manual_last4 ? 'Terminación de cuenta' : null,
      cardResult.data && cardResult.data.autopay_enabled === null ? 'Pago automático' : null,
      liabilityResult.data && !liabilityResult.data.lender ? 'Prestamista' : null,
      cardResult.data && !cardResult.data.credit_limit ? 'Límite de crédito' : null,
      !providerResult.data?.phone ? 'Teléfono de servicio' : null,
    ].filter(Boolean)

    return NextResponse.json({
      instance, obligation, provider: providerResult.data, schedule: scheduleResult.data,
      card: cardResult.data, loan: liabilityResult.data, linkedPlaidAccount,
      paymentLinks: links, reconciliationEvents: eventsResult.data || [],
      paymentState,
      paymentAccounts: options, suggestedPaymentAccount: suggestion, missingInformation: missing,
      lineage: {
        amount: instance.source || 'obligation instance',
        dueDate: 'obligation_instances.effective_due_date',
        graceDeadline: scheduleResult.data?.grace_day ? 'scheduled_payments.grace_day' : 'obligations.grace_period_days',
        balance: linkedPlaidAccount ? 'Plaid account balance' : liabilityResult.data ? 'Portfolio liability' : null,
      },
    })
  } catch (error) {
    console.error('Obligation details failed:', error)
    return NextResponse.json({ error: 'No se pudieron cargar los detalles' }, { status: 500 })
  }
}
