import { requireApiUser } from '@/lib/auth/requireApiUser'
import { requireMutationOrigin } from '@/lib/security/request-origin'
import { createServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { classifyDebtReductionCredit } from '@/lib/financial-engine/debt-reduction-credit'
import { safeLegacyConfigurationError } from '@/lib/financial-engine/legacy-obligation-migration'
import {
  deduplicateLegacyObligationCandidates,
  isEligibleUnpromotedPlaidCandidate,
  rankLegacyObligationCandidates,
} from '@/lib/financial-engine/legacy-obligation-candidates'
import {
  LedgerPromotionError,
  promotePlaidImportToQuickEntry,
} from '@/lib/financial-engine/ledger-promotion'
import { promoteBeforeLinkingLegacyObligation } from '@/lib/financial-engine/legacy-obligation-promotion'
import { loadLegacyPlaidSources } from '@/lib/financial-engine/legacy-obligation-plaid-sources'

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

    const windowStart = dateOffset(expectedDate, -180)
    const windowEnd = dateOffset(expectedDate, 180)
    const [obligationsResult, providersResult, entriesResult, plaidImportsResult, linkedEntriesResult] = await Promise.all([
      supabase
        .from('obligations')
        .select('id, name, default_amount, amount_is_estimated, frequency, owner, category_code, obligation_type, description, payment_method')
        .eq('household_id', schedule.household_id)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('obligation_providers')
        .select('obligation_id, provider_name, active_from, active_until')
        .eq('household_id', schedule.household_id),
      supabase
        .from('quick_entries')
        .select('id, entry_date, description, amount, account_name, entry_type, plaid_transaction_id')
        .eq('household_id', schedule.household_id)
        .gte('entry_date', windowStart)
        .lte('entry_date', windowEnd)
        .neq('entry_type', 'transfer')
        .order('entry_date', { ascending: false }),
      supabase
        .from('plaid_imports')
        .select('id, plaid_transaction_id, transaction_date, merchant, amount, institution_name, account_name, account_type, account_subtype, plaid_account_id, suggested_category, plaid_category, household_id, imported, pending, transaction_status, removed_at, superseded_at')
        .eq('household_id', schedule.household_id)
        .eq('imported', false)
        .eq('pending', false)
        .eq('transaction_status', 'active')
        .is('removed_at', null)
        .is('superseded_at', null)
        .gte('transaction_date', windowStart)
        .lte('transaction_date', windowEnd)
        .order('transaction_date', { ascending: false }),
      supabase
        .from('obligation_payment_links')
        .select('quick_entry_id, plaid_import_id')
        .eq('household_id', schedule.household_id),
    ])
    if (obligationsResult.error) throw obligationsResult.error
    if (providersResult.error) throw providersResult.error
    if (entriesResult.error) throw entriesResult.error
    if (plaidImportsResult.error) throw plaidImportsResult.error
    if (linkedEntriesResult.error) throw linkedEntriesResult.error

    const plaidTransactionIds = (entriesResult.data || [])
      .map((entry) => entry.plaid_transaction_id)
      .filter((id): id is string => Boolean(id))
    const plaidSources = await loadLegacyPlaidSources({
      plaidTransactionIds,
      householdId: schedule.household_id,
      loadBatch: (ids, householdId) =>
        supabase
          .from('plaid_imports')
          .select('plaid_transaction_id, merchant, amount, institution_name, plaid_account_id, account_type, account_subtype, suggested_category, plaid_category')
          .eq('household_id', householdId)
          .in('plaid_transaction_id', ids),
    })
    const plaidSourcesByTransactionId = new Map(
      plaidSources.map((source) => [source.plaid_transaction_id, source])
    )

    const expectedAmount = Number(schedule.amount || 0)
    const normalizedScheduleName = String(schedule.name || '').toUpperCase()
    const matchingObligations = (obligationsResult.data || []).filter((obligation) => {
      const obligationName = String(obligation.name || '').toUpperCase()
      return obligationName.includes(normalizedScheduleName) || normalizedScheduleName.includes(obligationName)
    })
    const obligationContext = matchingObligations.length === 1 ? matchingObligations[0] : null
    const providerContext = obligationContext
      ? (providersResult.data || []).find((provider) =>
          provider.obligation_id === obligationContext.id &&
          (!provider.active_from || provider.active_from <= expectedDate) &&
          (!provider.active_until || provider.active_until >= expectedDate)
        ) || null
      : null
    const linkedEntryIds = new Set(
      (linkedEntriesResult.data || []).map((link) => link.quick_entry_id).filter(Boolean)
    )
    const linkedPlaidImportIds = new Set(
      (linkedEntriesResult.data || []).map((link) => link.plaid_import_id).filter(Boolean)
    )
    const confirmedCandidates = (entriesResult.data || [])
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
        ...(() => {
          const source = entry.plaid_transaction_id
            ? plaidSourcesByTransactionId.get(entry.plaid_transaction_id)
            : null
          return {
            institution_name: source?.institution_name || null,
            plaid_account_id: source?.plaid_account_id || null,
            account_type: source?.account_type || null,
            account_subtype: source?.account_subtype || null,
            category: source?.suggested_category || source?.plaid_category || null,
          }
        })(),
        ...entry,
        amount: Number(entry.amount || 0),
        source: 'quick_entries' as const,
        confirmed: true,
        financialImpact: entry.entry_type === 'income'
          ? 'statement_credit'
          : 'expense',
        exactAmount: expectedAmount > 0 && Math.abs(Math.abs(Number(entry.amount || 0)) - expectedAmount) < 0.01,
      }))
    const pendingPlaidCandidates = (plaidImportsResult.data || [])
      .filter((item) => !linkedPlaidImportIds.has(item.id))
      .map((item) => ({
        id: item.id,
        entry_date: item.transaction_date || '',
        description: item.merchant || item.plaid_category || 'Movimiento Plaid',
        amount: Number(item.amount || 0),
        account_name: item.account_name,
        entry_type: Number(item.amount || 0) < 0 ? 'income' : 'expense',
        plaid_transaction_id: item.plaid_transaction_id,
        institution_name: item.institution_name,
        account_type: item.account_type,
        account_subtype: item.account_subtype,
        plaid_account_id: item.plaid_account_id,
        category: item.suggested_category || item.plaid_category,
        source: 'plaid_imports' as const,
        confirmed: false as const,
        financialImpact: 'expense' as const,
        exactAmount: expectedAmount > 0 && Math.abs(Math.abs(Number(item.amount || 0)) - expectedAmount) < 0.01,
      }))
    const candidates = rankLegacyObligationCandidates({
      candidates: deduplicateLegacyObligationCandidates(
        confirmedCandidates,
        pendingPlaidCandidates
      ),
      paymentName: schedule.name,
      expectedAmount,
      expectedDate,
      amountIsEstimated: obligationContext?.amount_is_estimated === true,
      providerName: providerContext?.provider_name || null,
      obligationType: obligationContext?.obligation_type || null,
      categoryCode: obligationContext?.category_code || schedule.category || null,
      contextNotes: obligationContext?.description || null,
      fundingAccountName: obligationContext?.payment_method || null,
    })
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
    const candidateSource = text(body.candidateSource) || 'quick_entries'
    const candidateId = text(body.candidateId) || quickEntryId
    const confirmAmountDifference = body.confirmAmountDifference === true
    const amount = Number(body.amount)

    if (!scheduledPaymentId || !name || !owner || !expectedDate || !effectiveDueDate || !candidateId || !(amount > 0)) {
      return NextResponse.json({ error: 'Completa la obligación y selecciona la transacción real pagada.' }, { status: 400 })
    }

    if (!['quick_entries', 'plaid_imports'].includes(candidateSource)) {
      return NextResponse.json({ error: 'La fuente del candidato no es válida.' }, { status: 400 })
    }

    const { data: schedule, error: scheduleError } = await supabase
      .from('scheduled_payments')
      .select('id, household_id')
      .eq('id', scheduledPaymentId)
      .maybeSingle()
    if (scheduleError) throw scheduleError
    if (!schedule) return NextResponse.json({ error: 'Calendario legacy no encontrado.' }, { status: 404 })

    const existingObligationResult = existingObligationId
      ? await supabase
          .from('obligations')
          .select('id, default_amount, amount_is_estimated')
          .eq('id', existingObligationId)
          .eq('household_id', schedule.household_id)
          .maybeSingle()
      : { data: null, error: null }
    if (existingObligationResult.error) throw existingObligationResult.error
    if (existingObligationId && !existingObligationResult.data) {
      return NextResponse.json({ error: 'La obligación seleccionada no está disponible.' }, { status: 404 })
    }

    const selectedCandidateResult = candidateSource === 'plaid_imports'
      ? await supabase
          .from('plaid_imports')
          .select('id, amount, transaction_date, household_id, imported, pending, transaction_status, removed_at, superseded_at')
          .eq('id', candidateId)
          .eq('household_id', schedule.household_id)
          .maybeSingle()
      : await supabase
          .from('quick_entries')
          .select('id, amount, entry_date, household_id')
          .eq('id', candidateId)
          .eq('household_id', schedule.household_id)
          .maybeSingle()
    const { data: selectedCandidate, error: selectedCandidateError } = selectedCandidateResult
    if (selectedCandidateError) throw selectedCandidateError
    if (!selectedCandidate) {
      return NextResponse.json({ error: 'La transacción seleccionada no está disponible.' }, { status: 409 })
    }

    if (candidateSource === 'plaid_imports') {
      const plaidCandidate = selectedCandidate as {
        household_id: string
        imported: boolean | null
        pending: boolean
        transaction_status: string
        removed_at: string | null
        superseded_at: string | null
        transaction_date: string | null
      }
      const start = dateOffset(expectedDate, -180)
      const end = dateOffset(expectedDate, 180)
      if (!isEligibleUnpromotedPlaidCandidate(
        plaidCandidate,
        schedule.household_id,
        start,
        end
      )) {
        return NextResponse.json({ error: 'El movimiento Plaid ya no es elegible para confirmar.' }, { status: 409 })
      }
    } else {
      const quickEntryDate = 'entry_date' in selectedCandidate
        ? selectedCandidate.entry_date
        : null
      if (
        !quickEntryDate ||
        quickEntryDate < dateOffset(expectedDate, -180) ||
        quickEntryDate > dateOffset(expectedDate, 180)
      ) {
        return NextResponse.json({ error: 'La transacción confirmada está fuera de la ventana permitida.' }, { status: 409 })
      }
    }

    const candidateAmount = Math.abs(Number(selectedCandidate.amount || 0))
    const authoritativeExpectedAmount = Number(
      existingObligationResult.data?.default_amount ?? amount
    )
    if (Math.abs(candidateAmount - authoritativeExpectedAmount) >= 0.01 && !confirmAmountDifference) {
      return NextResponse.json({ error: 'Confirma manualmente la diferencia de importe antes de continuar.' }, { status: 409 })
    }

    let data: unknown
    try {
      data = await promoteBeforeLinkingLegacyObligation({
        source: candidateSource as 'quick_entries' | 'plaid_imports',
        candidateId,
        promotePlaid: async (plaidImportId) => {
          const promotion = await promotePlaidImportToQuickEntry(supabase, auth.user.id, {
            plaidImportId,
            sourceRoute: '/api/obligations/configure-legacy',
            skipReconciliation: true,
          })
          return { quickEntryId: promotion.quickEntry.id }
        },
        linkConfirmedQuickEntry: async (confirmedQuickEntryId) => {
          const result = await supabase.rpc('configure_legacy_paid_obligation', {
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
            p_quick_entry_id: confirmedQuickEntryId,
          })
          if (result.error) throw result.error
          return result.data
        },
      })
    } catch (error) {
      if (error instanceof LedgerPromotionError) {
        return NextResponse.json({
          error: 'No se pudo confirmar el movimiento Plaid. La obligación permanece abierta.',
        }, { status: 409 })
      }
      throw error
    }

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
