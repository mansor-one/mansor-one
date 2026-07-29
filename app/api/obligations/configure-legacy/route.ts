import { requireApiUser } from '@/lib/auth/requireApiUser'
import { requireMutationOrigin } from '@/lib/security/request-origin'
import { createServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { classifyDebtReductionCredit } from '@/lib/financial-engine/debt-reduction-credit'
import { safeLegacyConfigurationError } from '@/lib/financial-engine/legacy-obligation-migration'

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function dateOffset(value: string, days: number) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  try {
    const { supabase } = await createServerSupabase()
    const auth = await requireApiUser(supabase)
    if (!auth.ok) return auth.response

    const url = new URL(request.url)
    const scheduledPaymentId = text(url.searchParams.get('scheduledPaymentId'))
    const expectedDate = text(url.searchParams.get('expectedDate'))
    if (!scheduledPaymentId || !expectedDate) {
      return NextResponse.json({ error: 'Falta el calendario o la fecha del pago.' }, { status: 400 })
    }

    const { data: schedule, error: scheduleError } = await supabase
      .from('scheduled_payments')
      .select('id, name, amount, owner, category, is_active, household_id')
      .eq('id', scheduledPaymentId)
      .maybeSingle()
    if (scheduleError) throw scheduleError
    if (!schedule) return NextResponse.json({ error: 'Calendario legacy no encontrado.' }, { status: 404 })

    const [obligationsResult, entriesResult, linkedEntriesResult] = await Promise.all([
      supabase
        .from('obligations')
        .select('id, name, default_amount, frequency, owner, category_code')
        .eq('household_id', schedule.household_id)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('quick_entries')
        .select('id, entry_date, description, amount, account_name, entry_type, plaid_transaction_id')
        .eq('household_id', schedule.household_id)
        .gte('entry_date', dateOffset(expectedDate, -180))
        .lte('entry_date', dateOffset(expectedDate, 180))
        .neq('entry_type', 'transfer')
        .order('entry_date', { ascending: false }),
      supabase
        .from('obligation_payment_links')
        .select('quick_entry_id')
        .eq('household_id', schedule.household_id)
        .not('quick_entry_id', 'is', null),
    ])
    if (obligationsResult.error) throw obligationsResult.error
    if (entriesResult.error) throw entriesResult.error
    if (linkedEntriesResult.error) throw linkedEntriesResult.error

    const plaidTransactionIds = (entriesResult.data || [])
      .map((entry) => entry.plaid_transaction_id)
      .filter((id): id is string => Boolean(id))
    const plaidSourcesResult = plaidTransactionIds.length > 0
      ? await supabase
          .from('plaid_imports')
          .select('plaid_transaction_id, merchant, amount, account_type, account_subtype, suggested_category, plaid_category')
          .eq('household_id', schedule.household_id)
          .in('plaid_transaction_id', plaidTransactionIds)
      : { data: [], error: null }
    if (plaidSourcesResult.error) throw plaidSourcesResult.error
    const plaidSourcesByTransactionId = new Map(
      (plaidSourcesResult.data || []).map((source) => [source.plaid_transaction_id, source])
    )

    const expectedAmount = Number(schedule.amount || 0)
    const linkedEntryIds = new Set(
      (linkedEntriesResult.data || []).map((link) => link.quick_entry_id).filter(Boolean)
    )
    const candidates = (entriesResult.data || [])
      .filter((entry) => !linkedEntryIds.has(entry.id))
      .filter((entry) => {
        if (entry.entry_type !== 'income') return true
        const source = entry.plaid_transaction_id
          ? plaidSourcesByTransactionId.get(entry.plaid_transaction_id)
          : null
        return Boolean(source && classifyDebtReductionCredit({
          description: source.merchant || entry.description,
          amount: Number(source.amount ?? entry.amount ?? 0),
          accountType: source.account_type,
          accountSubtype: source.account_subtype,
          category: source.suggested_category || source.plaid_category,
        }))
      })
      .map((entry) => ({
        ...entry,
        amount: Number(entry.amount || 0),
        confirmed: true,
        financialImpact: entry.entry_type === 'income'
          ? 'statement_credit'
          : 'expense',
        exactAmount: expectedAmount > 0 && Math.abs(Math.abs(Number(entry.amount || 0)) - expectedAmount) < 0.01,
      }))
      .sort((left, right) => Number(right.exactAmount) - Number(left.exactAmount) || right.entry_date.localeCompare(left.entry_date))
      .slice(0, 500)

    return NextResponse.json({
      schedule,
      obligations: obligationsResult.data || [],
      candidates,
      searchWindowDays: 180,
    })
  } catch (error) {
    const safeError = safeLegacyConfigurationError(error)
    console.error('Legacy obligation configuration read failed:', {
      stage: 'load_legacy_obligation_candidates',
      code: safeError.code,
      status: safeError.status,
    })
    return NextResponse.json({ error: 'No se pudo preparar la configuración de la obligación.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const originError = requireMutationOrigin(request)
    if (originError) return originError
    const { supabase } = await createServerSupabase()
    const auth = await requireApiUser(supabase)
    if (!auth.ok) return auth.response

    const body = await request.json()
    const scheduledPaymentId = text(body.scheduledPaymentId)
    const existingObligationId = text(body.existingObligationId)
    const name = text(body.name)
    const owner = text(body.owner)
    const categoryCode = text(body.categoryCode)
    const obligationType = text(body.obligationType) || 'other'
    const frequency = text(body.frequency) || 'monthly'
    const expectedDate = text(body.expectedDate)
    const effectiveDueDate = text(body.effectiveDueDate)
    const quickEntryId = text(body.quickEntryId)
    const amount = Number(body.amount)

    if (!scheduledPaymentId || !name || !owner || !expectedDate || !effectiveDueDate || !quickEntryId || !(amount > 0)) {
      return NextResponse.json({ error: 'Completa la obligación y selecciona la transacción real pagada.' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('configure_legacy_paid_obligation', {
      p_scheduled_payment_id: scheduledPaymentId,
      p_existing_obligation_id: existingObligationId,
      p_name: name,
      p_owner: owner,
      p_category_code: categoryCode,
      p_obligation_type: obligationType,
      p_frequency: frequency,
      p_default_amount: amount,
      p_expected_date: expectedDate,
      p_effective_due_date: effectiveDueDate,
      p_quick_entry_id: quickEntryId,
    })
    if (error) throw error

    return NextResponse.json({ success: true, result: data })
  } catch (error) {
    const safeError = safeLegacyConfigurationError(error)
    console.error('Legacy obligation configuration failed:', {
      stage: 'configure_legacy_paid_obligation',
      code: safeError.code,
      status: safeError.status,
    })
    return NextResponse.json({
      error: safeError.message,
      diagnosticCode: safeError.code,
    }, { status: safeError.status })
  }
}
