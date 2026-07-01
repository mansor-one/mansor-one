import { getDashboardSummary } from '@/lib/financial-engine'
import { requireUser } from '@/lib/auth/requireUser'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Robototina | Mansor One',
}

type ReviewItemRow = {
  id: string
  suggestion_id: string
  question: string
  status: string
  created_at: string
}

type SuggestionRow = {
  id: string
  plaid_import_id: string | null
  suggested_category: string
  confidence_score: number | null
}

type PlaidImportRow = {
  id: string
  merchant: string | null
  amount: number | null
  transaction_date: string | null
  institution_name: string | null
  account_name: string | null
  account_type: string | null
  account_subtype: string | null
}

type ReviewBrief = {
  item: ReviewItemRow
  suggestion: SuggestionRow | undefined
  plaidImport: PlaidImportRow | null
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatPercent(value: number | null) {
  if (value === null) return 'N/A'
  return `${Math.round(value * 100)}%`
}

function fallback(value: string | null | undefined, label = 'N/A') {
  return value || label
}

function dateValue(value: string | null | undefined) {
  if (!value) return 0

  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function compareReviewBriefs(a: ReviewBrief, b: ReviewBrief) {
  const plaidContextDifference =
    Number(Boolean(b.plaidImport)) - Number(Boolean(a.plaidImport))

  if (plaidContextDifference !== 0) {
    return plaidContextDifference
  }

  const aDate = dateValue(a.plaidImport?.transaction_date || a.item.created_at)
  const bDate = dateValue(b.plaidImport?.transaction_date || b.item.created_at)

  return bDate - aDate
}

function accountContext(plaidImport: PlaidImportRow | null | undefined) {
  if (!plaidImport) return 'Cuenta no identificada'

  const accountName = plaidImport.account_name || ''
  const accountKind = plaidImport.account_subtype || plaidImport.account_type || ''
  const accountLabel = [accountName, accountKind].filter(Boolean).join(' · ')

  if (plaidImport.institution_name) {
    return accountLabel
      ? `${plaidImport.institution_name} · ${accountLabel}`
      : plaidImport.institution_name
  }

  return accountName || 'Cuenta no identificada'
}

export default async function RobototinaPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)

  const [dashboardSummary, reviewItemsResult, reviewCountResult] = await Promise.all([
    getDashboardSummary(supabase, user.id),
    supabase
      .from('transaction_review_items')
      .select('id, suggestion_id, question, status, created_at')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('transaction_review_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending'),
  ])

  const reviewItems = (reviewItemsResult.data || []) as ReviewItemRow[]
  const suggestionIds = reviewItems.map((item) => item.suggestion_id)

  const suggestionsResult =
    suggestionIds.length > 0
      ? await supabase
          .from('transaction_suggestions')
          .select('id, plaid_import_id, suggested_category, confidence_score')
          .eq('user_id', user.id)
          .in('id', suggestionIds)
      : { data: [], error: null }

  const suggestions = (suggestionsResult.data || []) as SuggestionRow[]
  const plaidImportIds = suggestions
    .map((suggestion) => suggestion.plaid_import_id)
    .filter((id): id is string => Boolean(id))

  const plaidImportsResult =
    plaidImportIds.length > 0
      ? await supabase
          .from('plaid_imports')
          .select(
            'id, merchant, amount, transaction_date, institution_name, account_name, account_type, account_subtype'
          )
          .eq('user_id', user.id)
          .in('id', plaidImportIds)
      : { data: [], error: null }

  const plaidImports = (plaidImportsResult.data || []) as PlaidImportRow[]
  const suggestionsById = new Map(
    suggestions.map((suggestion) => [suggestion.id, suggestion])
  )
  const plaidImportsById = new Map(
    plaidImports.map((plaidImport) => [plaidImport.id, plaidImport])
  )

  const reviewBriefs = reviewItems
    .map((item) => {
      const suggestion = suggestionsById.get(item.suggestion_id)
      const plaidImport = suggestion?.plaid_import_id
        ? plaidImportsById.get(suggestion.plaid_import_id) || null
        : null

      return {
        item,
        suggestion,
        plaidImport,
      }
    })
    .sort(compareReviewBriefs)
    .slice(0, 3)

  const { liquidity, planning } = dashboardSummary
  const pendingReviewCount = reviewCountResult.count ?? reviewItems.length
  const hasErrors =
    reviewItemsResult.error ||
    reviewCountResult.error ||
    suggestionsResult.error ||
    plaidImportsResult.error

  return (
    <main className="p-8 space-y-6">
      <section className="border rounded p-4 space-y-2">
        <h1 className="text-4xl font-bold">Robototina</h1>
        <p>
          Buenos dias. Este es tu briefing financiero de hoy.
        </p>
      </section>

      {hasErrors && (
        <section className="border rounded p-4 text-red-600">
          No pude cargar todo el contexto de revision de transacciones.
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Disponible hoy</h2>
          <p className="text-3xl font-bold">
            ${money(liquidity.cashAvailableTotal)}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Pagos pendientes</h2>
          <p className="text-3xl font-bold">
            ${money(liquidity.totalPendingPayments)}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Proximos ingresos</h2>
          <p className="text-3xl font-bold">
            ${money(liquidity.totalConfirmedIncome)}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Resultado con ingresos</h2>
          <p className="text-3xl font-bold">
            ${money(liquidity.resultAfterIncome)}
          </p>
        </div>
      </section>

      <section className="border rounded p-4 space-y-4">
        <h2 className="text-2xl font-bold">Estado financiero</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded p-3">
            <h3 className="font-semibold">Antes de ingresos</h3>
            <p className="text-2xl font-bold">
              ${money(liquidity.resultToday)}
            </p>
          </div>

          <div className="border rounded p-3">
            <h3 className="font-semibold">Planning cercano</h3>
            <p className="text-2xl font-bold">
              ${money(planning.totalFutureObligations)}
            </p>
          </div>

          <div className="border rounded p-3">
            <h3 className="font-semibold">Transacciones por revisar</h3>
            <p className="text-2xl font-bold">{pendingReviewCount}</p>
          </div>
        </div>
      </section>

      <section className="border rounded p-4 space-y-4">
        <h2 className="text-2xl font-bold">Pagos pendientes</h2>

        <div className="space-y-2">
          {liquidity.pendingPayments.slice(0, 5).map((payment) => (
            <div key={payment.id} className="border rounded p-3">
              <h3 className="font-semibold">{payment.name}</h3>
              <p>Monto: ${money(payment.amount)}</p>
              <p>Fecha: {fallback(payment.effective_due_date, 'Sin fecha')}</p>
            </div>
          ))}

          {liquidity.pendingPayments.length === 0 && (
            <p className="opacity-70">No hay pagos pendientes.</p>
          )}
        </div>
      </section>

      <section className="border rounded p-4 space-y-4">
        <h2 className="text-2xl font-bold">Proximos ingresos</h2>

        <div className="space-y-2">
          {liquidity.confirmedIncome.slice(0, 5).map((income) => (
            <div key={income.id || income.name} className="border rounded p-3">
              <h3 className="font-semibold">{income.name}</h3>
              <p>Monto: ${money(income.amount)}</p>
              <p>
                Fecha: {fallback(income.next_expected_date, 'Sin fecha')}
              </p>
            </div>
          ))}

          {liquidity.confirmedIncome.length === 0 && (
            <p className="opacity-70">No hay ingresos proximos confirmados.</p>
          )}
        </div>
      </section>

      <section className="border rounded p-4 space-y-4">
        <h2 className="text-2xl font-bold">Necesito tu ayuda</h2>

        <div className="space-y-3">
          {reviewBriefs.map(({ item, suggestion, plaidImport }) => (
            <div key={item.id} className="border rounded p-4 space-y-1">
              <h3 className="text-xl font-semibold">
                {fallback(plaidImport?.merchant, 'Comercio desconocido')}
              </h3>
              <p>Monto: ${money(plaidImport?.amount)}</p>
              <p>
                Fecha: {fallback(plaidImport?.transaction_date, 'Sin fecha')}
              </p>
              <p>
                Institucion / cuenta: {accountContext(plaidImport)}
              </p>
              <p>
                Categoria sugerida:{' '}
                {fallback(suggestion?.suggested_category, 'Revisar')}
              </p>
              <p>
                Confianza: {formatPercent(suggestion?.confidence_score ?? null)}
              </p>
              <p className="font-semibold">{item.question}</p>
            </div>
          ))}

          {reviewBriefs.length === 0 && (
            <p className="opacity-70">
              No necesito revisar transacciones ahora mismo.
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
