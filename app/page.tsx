import { requireUser } from '@/lib/auth/requireUser'
import type { Metadata } from 'next'
import {
  canonicalCategoryCodeForText,
  buildTimelineProjectionFromLiquidity,
  commonMerchantDefaultCategoryCode,
  classifyRecentMovementImpact,
  type FinancialAsset,
  getCategoryByCode,
  getDashboardSummary,
  getRobototinaContext,
  getPortfolioSummary,
  getReviewQueue,
  type LedgerSummaryTransaction,
  type FinancialImpactResult,
  type MovementReconciliationContext,
  transactionContext,
  type TransactionContext,
} from '@/lib/financial-engine'
import Link from 'next/link'
import AppShell from './components/AppShell'
import InstitutionLogo from './components/InstitutionLogo'
import PaymentScheduleView from './components/PaymentScheduleView'
import FinancialHealthDrawer from './components/FinancialHealthDrawer'
import ExplainableInsight, { type ExplainableInsightData } from './components/ExplainableInsight'
import { reviewQueueDrilldown, spendingDrilldown, timelineDrilldown } from '@/lib/financial-engine/dashboard-drilldowns'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Dashboard | Mansor One',
}

type Movement = {
  id: string
  date: string
  merchant: string
  amount: number
  category: string
  categoryCode: string | null
  context: TransactionContext
  impact: FinancialImpactResult
}

type ReconciliationLinkRow = {
  quick_entry_id: string | null
  plaid_import_id: string | null
  reconciliation_status: string
  plaid_imports: { plaid_transaction_id: string | null } | Array<{ plaid_transaction_id: string | null }> | null
  obligation_instances: { obligations: { name: string | null } | Array<{ name: string | null }> | null } | Array<{ obligations: { name: string | null } | Array<{ name: string | null }> | null }> | null
}

type HealthStatus = {
  label: 'Estable' | 'Ajustado' | 'Riesgo'
  tone: 'green' | 'yellow' | 'red'
  detail: string
}

const monthNames = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

function money(value: unknown) {
  return `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined) return null

  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatDateTime(value: unknown) {
  if (typeof value !== 'string' || !value) return 'No sync timestamp'

  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Invalid sync timestamp'

  return date.toLocaleString('es-PR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function syncAgeMs(asset: FinancialAsset, now: Date) {
  const updatedAt = asset.metadata.updatedAt
  if (typeof updatedAt !== 'string' || !updatedAt) return null

  const updatedAtTime = new Date(updatedAt).getTime()
  if (!Number.isFinite(updatedAtTime)) return null

  return now.getTime() - updatedAtTime
}

function isStaleCashSync(asset: FinancialAsset, now: Date) {
  const ageMs = syncAgeMs(asset, now)

  return ageMs !== null && ageMs > 24 * 60 * 60 * 1000
}

function cashIncludedReason(asset: FinancialAsset) {
  if (asset.isConnected) {
    return asset.usableBalance === null
      ? 'Included as connected liquid cash; no usable balance available.'
      : 'Included as connected depository/cash; usable = lower of available and current balance.'
  }

  return 'Included as active manual account marked spendable.'
}

function categoryFromCode(code: string | null) {
  return code ? getCategoryByCode(code) : null
}

function resolvedCategoryCode(transaction: LedgerSummaryTransaction) {
  const ledgerCategoryCode = canonicalCategoryCodeForText(transaction.category)
  const merchantDefaultCode = commonMerchantDefaultCategoryCode(
    transaction.description,
    { amount: transaction.amount }
  )
  const ledgerCategory = categoryFromCode(ledgerCategoryCode)
  const merchantDefault = categoryFromCode(merchantDefaultCode)

  if (
    merchantDefault?.kind === 'expense' &&
    ledgerCategory &&
    ledgerCategory.kind !== 'expense'
  ) {
    return merchantDefault.code
  }

  return ledgerCategoryCode || merchantDefaultCode
}

function displayCategory(categoryCode: string | null) {
  return categoryFromCode(categoryCode)?.displayName || 'Pendiente'
}

function hasKnownValue(value: string | null | undefined) {
  return Boolean(value && value !== 'Unknown')
}

function displayInstitution(context: TransactionContext) {
  return hasKnownValue(context.institution)
    ? context.institution
    : 'Institución no identificada'
}

function displayAccount(context: TransactionContext) {
  if (hasKnownValue(context.accountLabel)) return context.accountLabel
  if (context.accountMask) {
    return `Cuenta no identificada ••••${context.accountMask}`
  }

  return 'Cuenta no identificada'
}

function contextRichnessScore(context: TransactionContext) {
  let score = 0

  if (hasKnownValue(context.institution)) score += 4
  if (hasKnownValue(context.accountName)) score += 4
  if (hasKnownValue(context.accountMask)) score += 2
  if (hasKnownValue(context.paymentMethod)) score += 2

  return score
}

function movementQualityScore(movement: Movement) {
  return (
    (movement.id.startsWith('quick_entries') ? 100 : 0) +
    contextRichnessScore(movement.context)
  )
}

function movementKey(movement: Movement) {
  const amountInCents = Math.round(Math.abs(movement.amount) * 100)

  return [
    movement.merchant,
    movement.date,
    amountInCents,
    movement.categoryCode || 'pending',
  ].join(':')
}

function dedupeMovements(movements: Movement[]) {
  const byKey = new Map<string, Movement>()

  movements.forEach((movement) => {
    const current = byKey.get(movementKey(movement))

    if (
      !current ||
      movementQualityScore(movement) > movementQualityScore(current)
    ) {
      byKey.set(movementKey(movement), movement)
    }
  })

  return [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date))
}

function movementFromTransaction(
  transaction: LedgerSummaryTransaction,
  reconciliation: MovementReconciliationContext | null
): Movement | null {
  if (!transaction.date) return null

  const context = transactionContext(transaction)
  const categoryCode = resolvedCategoryCode(transaction)

  return {
    id: `${transaction.sourceTable}:${transaction.id}`,
    date: transaction.date,
    merchant: context.normalizedMerchant,
    amount: Number(transaction.amount || 0),
    category: displayCategory(categoryCode),
    categoryCode,
    context,
    impact: classifyRecentMovementImpact(transaction, reconciliation),
  }
}

function impactTone(impact: FinancialImpactResult['impact']) {
  if (impact === 'debt_reduction' || impact === 'refund_or_statement_credit') {
    return 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
  }
  if (impact === 'income') return 'border-teal-700 bg-teal-950/50 text-teal-100'
  if (impact === 'expense') return 'border-neutral-600 bg-neutral-800 text-neutral-100'
  if (impact === 'internal_transfer') return 'border-blue-700 bg-blue-950/50 text-blue-100'
  if (impact === 'pending') return 'border-amber-700 bg-amber-950/50 text-amber-100'
  return 'border-neutral-600 bg-neutral-800 text-neutral-200'
}

function topCategories(movements: Movement[]) {
  const totals = new Map<string, { amount: number; count: number }>()

  movements.forEach((movement) => {
    const current = totals.get(movement.category) || { amount: 0, count: 0 }
    current.amount += movement.amount
    current.count += 1
    totals.set(movement.category, current)
  })

  return [...totals.entries()]
    .map(([category, value]) => ({ category, ...value }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
}

function topMerchants(movements: Movement[]) {
  const totals = new Map<string, { amount: number; count: number }>()

  movements.forEach((movement) => {
    const current = totals.get(movement.merchant) || { amount: 0, count: 0 }
    current.amount += movement.amount
    current.count += 1
    totals.set(movement.merchant, current)
  })

  return [...totals.entries()]
    .map(([merchant, value]) => ({ merchant, ...value }))
    .sort((a, b) => b.amount - a.amount)
}

function householdGreeting() {
  return 'Manuel y Soraya'
}

function timeOfDayGreeting(date: Date) {
  const hourText = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: 'America/Puerto_Rico',
  }).format(date)
  const hour = Number(hourText) % 24

  if (hour < 12) return 'Buenos días'
  if (hour < 18) return 'Buenas tardes'

  return 'Buenas noches'
}

function financialHealth(
  availableCash: number,
  committedPayments: number,
  resultToday: number
): HealthStatus {
  if (resultToday < 0) {
    return {
      label: 'Riesgo',
      tone: 'red',
      detail: 'Los pagos abiertos superan el efectivo disponible.',
    }
  }

  if (committedPayments > 0 && resultToday < committedPayments * 0.25) {
    return {
      label: 'Ajustado',
      tone: 'yellow',
      detail: 'Queda poco margen después de los pagos abiertos.',
    }
  }

  return {
    label: 'Estable',
    tone: 'green',
    detail:
      availableCash > 0
        ? 'Los pagos abiertos están cubiertos por el efectivo disponible.'
        : 'No hay efectivo disponible registrado.',
  }
}

function toneClasses(tone: 'green' | 'yellow' | 'red') {
  if (tone === 'green') return 'border-emerald-700 bg-emerald-950/40'
  if (tone === 'yellow') return 'border-amber-700 bg-amber-950/40'

  return 'border-red-700 bg-red-950/40'
}

function toneDot(tone: 'green' | 'yellow' | 'red') {
  if (tone === 'green') return '🟢'
  if (tone === 'yellow') return '🟡'

  return '🔴'
}

function paymentMethodSplit(movements: Movement[]) {
  const credit = movements
    .filter((movement) => movement.context.paymentMethod === 'Credit')
    .reduce((sum, movement) => sum + movement.amount, 0)
  const debit = movements
    .filter((movement) => movement.context.paymentMethod === 'Debit')
    .reduce((sum, movement) => sum + movement.amount, 0)
  const total = credit + debit

  return {
    credit,
    debit,
    creditPercent: total > 0 ? Math.round((credit / total) * 100) : 0,
    debitPercent: total > 0 ? Math.round((debit / total) * 100) : 0,
  }
}

function reviewProgress(confirmedCount: number, pendingCount: number) {
  const total = confirmedCount + pendingCount

  return total > 0 ? Math.round((confirmedCount / total) * 100) : 100
}

function CashBalanceBreakdown({
  accounts,
  now,
}: {
  accounts: FinancialAsset[]
  now: Date
}) {
  const staleAccounts = accounts.filter((account) =>
    isStaleCashSync(account, now)
  )

  return (
    <details className="mt-4 rounded border border-neutral-700 bg-neutral-950/50 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-neutral-100">
        Ver cuentas incluidas ({accounts.length})
      </summary>

      <div className="mt-3 space-y-3">
        {staleAccounts.length > 0 && (
          <div className="rounded border border-amber-700 bg-amber-950/40 p-3 text-xs text-amber-100">
            <p>
              {staleAccounts.length === 1
                ? '1 cuenta incluida tiene balance stale.'
                : `${staleAccounts.length} cuentas incluidas tienen balance stale.`}{' '}
              Revisa la hora de sincronización antes de tomar decisiones de
              cash.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                className="rounded border border-amber-600 px-2 py-1 font-semibold transition hover:bg-amber-900/60"
                href="/portfolio"
              >
                Ver Portfolio
              </Link>
              <Link
                className="rounded border border-amber-600 px-2 py-1 font-semibold transition hover:bg-amber-900/60"
                href="/plaid"
              >
                Ver bancos conectados
              </Link>
            </div>
          </div>
        )}

        {accounts.map((account) => {
          const updatedAt = account.metadata.updatedAt
          const stale = isStaleCashSync(account, now)
          const availableBalance = numberOrNull(account.availableBalance)
          const currentBalance = numberOrNull(account.balance)
          const usableBalance = numberOrNull(account.usableBalance)

          return (
            <div
              className="rounded border border-neutral-800 bg-neutral-950/60 p-3 text-sm"
              key={account.id}
            >
              <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-semibold">
                    {account.institution || 'Manual'} ·{' '}
                    {account.name || 'Cuenta sin nombre'}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {cashIncludedReason(account)}
                  </p>
                </div>
                {stale && (
                  <span className="w-fit rounded border border-amber-700 px-2 py-1 text-xs text-amber-100">
                    Stale sync
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                <div>
                  <p className="text-neutral-400">Usable</p>
                  <p className="font-bold">{money(usableBalance)}</p>
                </div>
                <div>
                  <p className="text-neutral-400">Available</p>
                  <p className="font-bold">{money(availableBalance)}</p>
                </div>
                <div>
                  <p className="text-neutral-400">Current</p>
                  <p className="font-bold">{money(currentBalance)}</p>
                </div>
                <div>
                  <p className="text-neutral-400">Last synced</p>
                  <p className="font-bold">{formatDateTime(updatedAt)}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </details>
  )
}

export default async function Home() {
  const { supabase, user } = await requireUser()
  const now = new Date()
  const startOfMonth = dateOnly(new Date(now.getFullYear(), now.getMonth(), 1))
  const today = dateOnly(now)
  const startOfQuincena = dateOnly(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() > 15 ? 16 : 1)
  )
  const currentMonth = `${monthNames[now.getMonth()]} ${now.getFullYear()}`
  const spendingPeriod = { year: now.getFullYear(), month: now.getMonth() + 1 }
  const incomeMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [dashboardSummary, portfolioSummary, reviewQueue, robototinaContext] = await Promise.all([
    getDashboardSummary(supabase, user.id),
    getPortfolioSummary(supabase, user.id),
    getReviewQueue(supabase, user.id),
    getRobototinaContext(supabase, user.id),
  ])

  const { liquidity, planning } = dashboardSummary
  const timeline = buildTimelineProjectionFromLiquidity(liquidity, {
    today: dateOnly(now),
  })
  const ledgerSummary = reviewQueue.source.ledgerSummary
  const { data: reconciliationLinks, error: reconciliationLinksError } = await supabase
    .from('obligation_payment_links')
    .select('quick_entry_id, plaid_import_id, reconciliation_status, plaid_imports(plaid_transaction_id), obligation_instances(obligations(name))')
    .eq('user_id', user.id)
    .in('reconciliation_status', ['pending_settlement', 'reconciled'])
  if (reconciliationLinksError) throw reconciliationLinksError
  const reconciliationByTransaction = new Map<string, MovementReconciliationContext>()
  for (const link of (reconciliationLinks || []) as ReconciliationLinkRow[]) {
    const instance = Array.isArray(link.obligation_instances)
      ? link.obligation_instances[0]
      : link.obligation_instances
    const obligation = Array.isArray(instance?.obligations)
      ? instance.obligations[0]
      : instance?.obligations
    const plaidImport = Array.isArray(link.plaid_imports)
      ? link.plaid_imports[0]
      : link.plaid_imports
    const context = {
      status: link.reconciliation_status,
      obligationName: obligation?.name || null,
    }
    if (link.quick_entry_id) reconciliationByTransaction.set(`quick_entries:${link.quick_entry_id}`, context)
    if (link.plaid_import_id) reconciliationByTransaction.set(`plaid_imports:${link.plaid_import_id}`, context)
    if (plaidImport?.plaid_transaction_id) reconciliationByTransaction.set(`plaid:${plaidImport.plaid_transaction_id}`, context)
  }
  const household = householdGreeting()
  const greeting = timeOfDayGreeting(now)
  const confirmedMovements = dedupeMovements(
    ledgerSummary.confirmedLedgerEntries
      .map((transaction) => movementFromTransaction(
        transaction,
        reconciliationByTransaction.get(`${transaction.sourceTable}:${transaction.id}`) ||
          (transaction.plaidTransactionId
            ? reconciliationByTransaction.get(`plaid:${transaction.plaidTransactionId}`)
            : null) ||
          null
      ))
      .filter((movement): movement is Movement => movement !== null)
  )
  const currentMonthMovements = confirmedMovements.filter(
    (movement) =>
      movement.date >= startOfMonth &&
      movement.date <= today &&
      movement.amount > 0
  )
  const spendingMovements = currentMonthMovements.filter((movement) => {
    const category = categoryFromCode(movement.categoryCode)

    return category?.kind === 'expense'
  })
  const quincenaMovements = spendingMovements.filter(
    (movement) => movement.date >= startOfQuincena
  )
  const nonSpendingMovements = currentMonthMovements.filter((movement) => {
    const category = categoryFromCode(movement.categoryCode)

    return Boolean(category && category.kind !== 'expense')
  })
  const monthlySpent = spendingMovements.reduce(
    (sum, movement) => sum + movement.amount,
    0
  )
  const quincenaSpent = quincenaMovements.reduce(
    (sum, movement) => sum + movement.amount,
    0
  )
  const categoryRows = topCategories(spendingMovements)
  const merchantRows = topMerchants(spendingMovements)
  const recentMovements = confirmedMovements.slice(0, 6)
  const largestTransaction = spendingMovements
    .slice()
    .sort((a, b) => b.amount - a.amount)[0]
  const topCategory = categoryRows[0]
  const topMerchant = merchantRows[0]
  const upcomingPayments = liquidity.lifecyclePayments
    .filter((payment) => payment.lifecycleIsOpen !== false)
    .slice()
    .sort((a, b) =>
      String(a.effective_due_date || '').localeCompare(
        String(b.effective_due_date || '')
      )
    )
  const planningItems = planning.planningItems.slice(0, 3)
  const nextPlanningItem = planningItems[0]
  const health = financialHealth(
    portfolioSummary.totalLiquidAvailable,
    timeline.explanation.finalBalance.totalPayments,
    timeline.finalBalance
  )
  const methodSplit = paymentMethodSplit(spendingMovements)
  const healthObligations = timeline.events
    .filter((event) => event.type === 'payment')
    .slice()
    .sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount))
  const primaryHealthObligations = healthObligations.slice(0, 3)
  const projectedHealthMargin = timeline.finalBalance
  const currentMonthIncome = timeline.events
    .filter((event) => event.type === 'income' && event.date.startsWith(incomeMonth))
    .reduce((sum, event) => sum + event.amount, 0)
  const reviewPercent = reviewProgress(
    currentMonthMovements.length,
    reviewQueue.statistics.totalCandidates
  )
  const robototinaRecommendations = robototinaContext.advisorRecommendations.slice(0, 2).map((item) => ({ id: item.id, title: item.recommendation, reason: item.reason }))
  const categoryInsight: ExplainableInsightData = {
    id: 'top-category', label: 'Mayor categoría', value: topCategory?.category || 'Sin datos', detail: topCategory ? money(topCategory.amount) : undefined,
    why: topCategory ? 'Apareció porque esta categoría acumula el mayor gasto confirmado del mes actual.' : 'Todavía no hay gastos confirmados suficientes para identificar una categoría principal.',
    classification: 'informativo',
    facts: [{ label: 'Período', value: currentMonth }, { label: 'Total de la categoría', value: money(topCategory?.amount || 0) }, { label: 'Movimientos incluidos', value: String(topCategory?.count || 0) }, { label: 'Gasto confirmado del mes', value: money(monthlySpent) }],
    related: topCategory ? spendingMovements.filter((movement) => movement.category === topCategory.category).map((movement) => ({ id: movement.id, title: movement.merchant, detail: `${movement.date} · ${money(movement.amount)}` })) : [], recommendations: robototinaRecommendations,
  }
  const merchantInsight: ExplainableInsightData = {
    id: 'top-merchant', label: 'Mayor comercio', value: topMerchant?.merchant || 'Sin datos', detail: topMerchant ? money(topMerchant.amount) : undefined,
    why: topMerchant ? 'Apareció porque este comercio concentra el mayor monto de gastos confirmados del mes.' : 'Todavía no hay gastos confirmados suficientes para identificar un comercio principal.',
    classification: 'informativo', facts: [{ label: 'Período', value: currentMonth }, { label: 'Total del comercio', value: money(topMerchant?.amount || 0) }, { label: 'Movimientos incluidos', value: String(topMerchant?.count || 0) }],
    related: topMerchant ? spendingMovements.filter((movement) => movement.merchant === topMerchant.merchant).map((movement) => ({ id: movement.id, title: movement.merchant, detail: `${movement.date} · ${movement.category} · ${money(movement.amount)}` })) : [], recommendations: robototinaRecommendations,
  }
  const purchaseInsight: ExplainableInsightData = {
    id: 'largest-purchase', label: 'Mayor compra', value: largestTransaction?.merchant || 'Sin datos', detail: largestTransaction ? money(largestTransaction.amount) : undefined,
    why: largestTransaction ? 'Apareció porque es la transacción de gasto confirmado con el importe individual más alto del mes.' : 'Todavía no hay compras confirmadas para comparar.',
    classification: 'informativo', facts: [{ label: 'Período', value: currentMonth }, { label: 'Importe', value: money(largestTransaction?.amount || 0) }, { label: 'Fecha', value: largestTransaction?.date || 'Sin datos' }, { label: 'Categoría', value: largestTransaction?.category || 'Sin datos' }],
    related: largestTransaction ? [{ id: largestTransaction.id, title: largestTransaction.merchant, detail: `${largestTransaction.date} · ${largestTransaction.category} · ${money(largestTransaction.amount)}` }] : [], recommendations: robototinaRecommendations,
  }
  const creditInsight: ExplainableInsightData = {
    id: 'credit-over-cash', label: 'Uso de crédito', value: 'Este mes usas más crédito que efectivo', detail: `Crédito ${methodSplit.creditPercent}% · débito ${methodSplit.debitPercent}%`,
    why: 'Apareció porque el importe de gastos confirmados pagados con crédito supera el importe pagado con débito o efectivo durante el mes.', classification: 'riesgo',
    facts: [{ label: 'Gasto con crédito', value: money(methodSplit.credit) }, { label: 'Gasto con débito o efectivo', value: money(methodSplit.debit) }, { label: 'Participación de crédito', value: `${methodSplit.creditPercent}%` }, { label: 'Período', value: currentMonth }],
    related: spendingMovements.filter((movement) => String(movement.context.paymentMethod || '').toLowerCase().includes('credit')).map((movement) => ({ id: movement.id, title: movement.merchant, detail: `${movement.date} · ${money(movement.amount)}` })), recommendations: robototinaRecommendations,
  }
  const planningInsight: ExplainableInsightData = {
    id: 'next-planning-fund', label: '🎯 Fondo más cercano', value: nextPlanningItem?.name || 'Sin configurar', detail: nextPlanningItem ? `${nextPlanningItem.due_date || 'Sin fecha'} · ${money(nextPlanningItem.target_amount)}` : 'Planning todavía necesita configuración',
    why: nextPlanningItem ? 'Apareció porque es el primer fondo activo devuelto por la planificación actual del hogar.' : 'Apareció para señalar que todavía no existe un fondo activo configurado.', classification: 'informativo',
    facts: [{ label: 'Fondos activos', value: String(planning.planningItems.length) }, { label: 'Monto objetivo', value: money(nextPlanningItem?.target_amount || 0) }, { label: 'Fecha objetivo', value: nextPlanningItem?.due_date || 'Sin configurar' }, { label: 'Obligaciones futuras', value: money(planning.totalFutureObligations) }],
    related: nextPlanningItem ? [{ id: nextPlanningItem.id, title: nextPlanningItem.name || 'Fondo', detail: `${nextPlanningItem.due_date || 'Sin fecha'} · objetivo ${money(nextPlanningItem.target_amount)}` }] : [], recommendations: robototinaRecommendations,
  }
  const dashboardRobototinaInsights: ExplainableInsightData[] = robototinaContext.insights.map((insight) => {
    const relatedPayments = insight.id === 'grace-period' ? robototinaContext.liquidity.gracePeriodPayments : insight.id === 'lowest-point' ? robototinaContext.timeline.lowestPointPayments : insight.id === 'open-payments' ? robototinaContext.liquidity.openPayments : []
    return {
      id: insight.id, label: 'Robototina', value: insight.title,
      why: insight.message, classification: ['critical', 'warning'].includes(insight.tone) ? 'riesgo' : 'informativo',
      facts: [{ label: 'Efectivo disponible', value: money(robototinaContext.liquidity.availableCash) }, { label: 'Pagos abiertos', value: String(robototinaContext.liquidity.openPaymentsCount) }, { label: 'Compromisos abiertos', value: money(robototinaContext.liquidity.openPaymentsTotal) }, { label: 'Generado', value: formatDateTime(robototinaContext.generatedAt) }],
      related: relatedPayments.map((payment) => ({ id: payment.id, title: payment.name || 'Obligación', detail: `${payment.effective_due_date || payment.due_date || 'Sin fecha'} · ${money(payment.amount)}` })),
      recommendations: robototinaRecommendations,
    }
  })
  const includedCashAccounts = portfolioSummary.liquidAssets
  const lastUpdated = now.toLocaleString('es-PR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  // TODO: AI recommendations.
  // TODO: Cash-flow prediction.
  // TODO: Budget alerts.
  // TODO: Fund consumption suggestions.
  // TODO: Household insights.

  return (
    <AppShell
      header={{
        eyebrow: currentMonth,
        title: `${greeting}, ${household}.`,
        subtitle: 'Resumen familiar de efectivo, gastos, pagos y movimientos pendientes.',
        secondaryAction: (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 md:text-right">
              <p>Actualizado: {lastUpdated}</p>
              <p>Movimientos confirmados y pendientes al día.</p>
          </div>
        ),
      }}
    >

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div
            className={`rounded-lg border p-4 xl:col-span-2 ${toneClasses(
              health.tone
            )}`}
          >
            <p className="text-sm text-neutral-300">💰 Disponible hoy</p>
            <p className="mt-2 text-3xl font-bold">
              {money(portfolioSummary.totalLiquidAvailable)}
            </p>
            <p className="mt-3 text-sm">Estado</p>
            <p className="text-xl font-bold">
              {toneDot(health.tone)} {health.label}
            </p>
            <p className="mt-1 text-xs text-neutral-300">{health.detail}</p>
            <FinancialHealthDrawer>
            <div className="space-y-3 rounded border border-neutral-700 bg-neutral-950/40 p-3 text-sm">
              <div>
                <p className="font-semibold">¿Por qué?</p>
                <p className="mt-1 text-neutral-300">
                  {money(timeline.startingCash)} disponibles +{' '}
                  {money(timeline.expectedIncomeTotal)} de ingresos esperados −{' '}
                  {money(timeline.explanation.finalBalance.totalPayments)} en obligaciones abiertas.
                </p>
              </div>

              <div>
                <p className="font-semibold">
                  {projectedHealthMargin < 0 ? 'Déficit proyectado' : 'Margen proyectado'}
                </p>
                <p className={`text-xl font-bold ${projectedHealthMargin < 0 ? 'text-red-200' : 'text-emerald-200'}`}>
                  {money(Math.abs(projectedHealthMargin))}
                </p>
                <p className="text-xs text-neutral-400">
                  Al final del horizonte activo de {timeline.horizonDays} días.
                </p>
              </div>

              <div>
                <p className="font-semibold">Obligaciones que más pesan</p>
                {primaryHealthObligations.length > 0 ? (
                  <ul className="mt-1 space-y-1 text-neutral-300">
                    {primaryHealthObligations.map((event) => (
                      <li className="flex justify-between gap-3" key={`health:${event.id}`}>
                        <span>{event.title} · {event.dueDate}</span>
                        <strong>{money(Math.abs(event.amount))}</strong>
                      </li>
                    ))}
                    {healthObligations.length > primaryHealthObligations.length ? (
                      <li className="text-xs text-neutral-400">
                        + {healthObligations.length - primaryHealthObligations.length} obligaciones adicionales
                      </li>
                    ) : null}
                  </ul>
                ) : (
                  <p className="mt-1 text-neutral-400">No hay obligaciones abiertas dentro del horizonte.</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  className="rounded border border-neutral-600 px-3 py-2 text-xs font-semibold hover:bg-neutral-800"
                  href={timelineDrilldown({ horizon: timeline.horizonDays, view: 'actionable' })}
                >
                  Revisar obligaciones
                </Link>
                <Link
                  className="rounded border border-neutral-600 px-3 py-2 text-xs font-semibold hover:bg-neutral-800"
                  href={`/timeline?horizon=${timeline.horizonDays}#lowest-point`}
                >
                  Ver punto más bajo
                </Link>
              </div>
            </div>
            <CashBalanceBreakdown accounts={includedCashAccounts} now={now} />
            <Link
              className="mt-3 inline-flex rounded border border-neutral-600 px-3 py-2 text-xs font-semibold transition hover:border-neutral-300 hover:bg-neutral-800"
              href="/portfolio#cash"
            >
              Ver cuentas en Portfolio
            </Link>
            </FinancialHealthDrawer>
          </div>
          <SummaryCard
            label="Gastado este mes"
            value={money(monthlySpent)}
            detail={`${spendingMovements.length} movimientos`}
            href={spendingDrilldown({ ...spendingPeriod, view: 'confirmed-expenses' })}
          />
          <SummaryCard
            label="Gastado esta quincena"
            value={money(quincenaSpent)}
            detail={`Desde ${startOfQuincena}`}
            href={spendingDrilldown({ ...spendingPeriod, view: 'confirmed-expenses', from: startOfQuincena })}
          />
          <SummaryCard
            label="Pendientes por clasificar"
            value={reviewQueue.statistics.totalCandidates}
            detail="Pendientes por clasificar"
            href={reviewQueueDrilldown('all')}
          />
          <SummaryCard
            label="Movimientos no-gasto"
            value={nonSpendingMovements.length}
            detail="Pagos y transferencias"
            href={spendingDrilldown({ ...spendingPeriod, view: 'non-spending' })}
          />
          <SummaryCard
            label="Obligaciones abiertas"
            value={money(timeline.openObligationTotal)}
            detail={`${timeline.trustedPayments.filter((payment) => ['possible_match', 'unpaid', 'due_soon', 'due_today', 'grace_period', 'overdue', 'needs_review'].includes(payment.truthStatus)).length} obligaciones sin liquidar`}
            helper="No incluye pagos que ya confirmaste y están pendientes de liquidación."
            href={timelineDrilldown({ horizon: timeline.horizonDays, view: 'open' })}
          />
          <SummaryCard
            label="Pending settlement"
            value={money(timeline.inTransitPaymentTotal)}
            detail={`${timeline.paymentCounts.in_transit} pagos iniciados recientemente`}
            helper={timeline.paymentCounts.in_transit > 0 ? 'Se detectó un pago reciente que todavía no ha sido confirmado por el banco.' : 'No hay pagos recientes esperando confirmación bancaria.'}
            href={`/timeline?horizon=${timeline.horizonDays}#in-transit`}
            valueClassName="text-amber-200"
          />
          <SummaryCard
            label="Reconciliado recientemente"
            value={money(timeline.reconciledRecentlyTotal)}
            detail="Últimos 30 días"
            helper="Pagos cerrados por confirmación explícita o evidencia bancaria confiable."
            href={`/timeline?horizon=${timeline.horizonDays}#payments`}
            valueClassName="text-emerald-200"
          />
          <SummaryCard
            label="Ingresos este mes"
            value={money(currentMonthIncome)}
            detail="Eventos de ingreso en Timeline"
            href={timelineDrilldown({ horizon: timeline.horizonDays, view: 'income', month: incomeMonth })}
            valueClassName="text-emerald-200"
          />
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ExplainableInsight insight={{ ...purchaseInsight, label: '🏆 Mayor gasto' }} />
          <ExplainableInsight insight={{ ...categoryInsight, label: '🍽 Categoría principal' }} />
          <ExplainableInsight insight={{ ...creditInsight, label: '💳 Uso de crédito', value: `${methodSplit.creditPercent}%` }} />
          <ExplainableInsight insight={planningInsight} />
          <SummaryCard
            label="🏦 Net worth"
            value={money(portfolioSummary.netWorth)}
            detail={`${portfolioSummary.totalAssets} activos · ${money(
              portfolioSummary.totalLiabilities
            )} deudas`}
            href="/portfolio#net-worth"
          />
        </section>

        {methodSplit.credit > methodSplit.debit && <section className="rounded-lg border border-amber-700 bg-amber-950/40 p-2 text-sm"><ExplainableInsight insight={creditInsight} /></section>}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Gastos por categoría</h2>
                <p className="text-sm text-neutral-400">
                  Top 5 del mes actual
                </p>
              </div>
              <Link className="rounded border border-neutral-700 px-3 py-2 text-sm" href={spendingDrilldown({ ...spendingPeriod, view: 'confirmed-expenses' })}>
                Ver gastos
              </Link>
            </div>

            <div className="space-y-2">
              {categoryRows.length > 0 ? (
                categoryRows.map((row) => (
                  <Link
                    className="grid grid-cols-3 gap-3 border-t border-neutral-800 py-3 text-sm"
                    href={spendingDrilldown({ ...spendingPeriod, view: 'confirmed-expenses', category: spendingMovements.find((movement) => movement.category === row.category)?.categoryCode })}
                    key={row.category}
                  >
                    <span className="font-medium">{row.category}</span>
                    <span>{money(row.amount)}</span>
                    <span className="text-neutral-400">
                      {row.count} movimientos
                    </span>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-neutral-400">
                  Todavía no hay gastos confirmados este mes.
                </p>
              )}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 border-t border-neutral-800 pt-4 md:grid-cols-3">
              <ExplainableInsight insight={categoryInsight} />
              <ExplainableInsight insight={merchantInsight} />
              <ExplainableInsight insight={purchaseInsight} />
            </div>
          </section>

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">📝 Decisiones pendientes</h2>
                <p className="text-sm text-neutral-400">
                  Movimientos que necesitan atención
                </p>
              </div>
              <Link
                className="rounded border border-neutral-700 px-3 py-2 text-sm"
                href={reviewQueueDrilldown('toReview')}
              >
                Revisar movimientos
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Metric href={reviewQueueDrilldown('all')} label="Total" value={reviewQueue.statistics.totalCandidates} />
              <Metric href={reviewQueueDrilldown('toReview', 'needs-category')} label="Categoría" value={reviewQueue.needsCategory.length} />
              <Metric href={reviewQueueDrilldown('ath')} label="ATH" value={reviewQueue.athReview.length} />
              <Metric href={reviewQueueDrilldown('duplicates')} label="Similitudes" value={reviewQueue.possibleDuplicate.length} />
              <Metric href={reviewQueueDrilldown('ready')} label="Listos" value={reviewQueue.readyToConfirm.length} />
            </div>

            <div className="mt-4 rounded border border-neutral-800 p-3">
              <p className="text-sm text-neutral-400">
                Movimientos clasificados
              </p>
              <p className="text-3xl font-bold">{reviewPercent}%</p>
              <p className="text-sm text-neutral-400">
                Solo faltan {reviewQueue.statistics.totalCandidates}{' '}
                movimientos para completar {monthNames[now.getMonth()]}.
              </p>
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <div className="mb-4">
            <h2 className="text-xl font-bold">Crédito vs débito</h2>
            <p className="text-sm text-neutral-400">
              Distribución del gasto confirmado este mes
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Link className="rounded border border-neutral-800 p-3" href={spendingDrilldown({ ...spendingPeriod, view: 'confirmed-expenses', paymentMethod: 'Credit' })}>
              <p className="text-sm text-neutral-400">Crédito</p>
              <p className="text-3xl font-bold">{methodSplit.creditPercent}%</p>
              <p className="text-sm text-neutral-400">
                {money(methodSplit.credit)}
              </p>
            </Link>
            <Link className="rounded border border-neutral-800 p-3" href={spendingDrilldown({ ...spendingPeriod, view: 'confirmed-expenses', paymentMethod: 'Debit' })}>
              <p className="text-sm text-neutral-400">Débito</p>
              <p className="text-3xl font-bold">{methodSplit.debitPercent}%</p>
              <p className="text-sm text-neutral-400">
                {money(methodSplit.debit)}
              </p>
            </Link>
          </div>
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <div className="mb-4">
            <h2 className="text-xl font-bold">Movimientos recientes</h2>
            <p className="text-sm text-neutral-400">
              Últimos movimientos confirmados
            </p>
          </div>

          <div className="space-y-2">
            {recentMovements.map((movement) => (
              <div
                className="grid grid-cols-1 gap-2 border-t border-neutral-800 py-3 text-sm md:grid-cols-[0.7fr_1.25fr_0.65fr_1fr_1.15fr_1.25fr] md:items-center"
                key={movement.id}
              >
                <span className="text-neutral-400">{movement.date}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{movement.merchant}</span>
                  {movement.impact.contextText && <span className="block text-xs text-neutral-300">{movement.impact.contextText}</span>}
                </span>
                <span>{money(movement.amount)}</span>
                <span>{movement.category}</span>
                <span
                  className={`inline-flex w-fit items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${impactTone(movement.impact.impact)}`}
                  title={movement.impact.reason}
                >
                  <span aria-hidden="true">{movement.impact.icon}</span>
                  <span>{movement.impact.label}</span>
                </span>
                <span className="flex min-w-0 items-center gap-2 text-neutral-400">
                  <InstitutionLogo
                    institution={displayInstitution(movement.context)}
                    size="sm"
                  />
                  <span className="min-w-0 truncate">
                    {displayInstitution(movement.context)} ·{' '}
                    {displayAccount(movement.context)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="mb-4">
              <h2 className="text-xl font-bold">🎯 Planning</h2>
              <p className="text-sm text-neutral-400">
                Prioridades y obligaciones próximas
              </p>
            </div>

            {planningItems.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-neutral-400">
                  {planning.planningItems.length} fondos activos
                </p>
                {planning.overduePayments &&
                  planning.overduePayments.length > 0 && (
                    <div className="rounded border border-red-700 bg-red-950/40 p-3 text-sm">
                      🔴 {planning.overduePayments.length} pagos vencidos para
                      considerar antes de mover fondos.
                    </div>
                  )}
                <div className="rounded border border-neutral-800 p-3">
                  <p className="text-sm text-neutral-400">Próximo objetivo</p>
                  <p className="text-xl font-bold">
                    {nextPlanningItem?.name || 'Prioridad'}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-neutral-400">Disponible</p>
                      <p className="font-bold">
                        {money(portfolioSummary.totalLiquidAvailable)}
                      </p>
                    </div>
                    <div>
                      <p className="text-neutral-400">Meta</p>
                      <p className="font-bold">
                        {money(nextPlanningItem?.target_amount)}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-neutral-400">
                  Obligaciones abiertas: {money(planning.totalFutureObligations)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-neutral-400">
                Planning todavía necesita configuración.
              </p>
            )}
          </section>

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="mb-4">
              <h2 className="text-xl font-bold">Robototina</h2>
              <p className="text-sm text-neutral-400">
                Robototina todavía está aprendiendo.
              </p>
            </div>

            <div className="space-y-3 text-sm">
              {dashboardRobototinaInsights.length ? dashboardRobototinaInsights.map((insight) => <ExplainableInsight insight={insight} key={insight.id} />) : <p className="text-neutral-400">No hay insights activos con el contexto financiero actual.</p>}
            </div>
          </section>
        </div>

        <PaymentScheduleView payments={upcomingPayments} today={today} />
    </AppShell>
  )
}

function SummaryCard({
  label,
  value,
  detail,
  helper,
  href,
  valueClassName = 'text-neutral-100',
}: {
  label: string
  value: string | number
  detail: string
  helper?: string
  href?: string
  valueClassName?: string
}) {
  const className =
    'rounded-lg border border-neutral-800 bg-neutral-900 p-4 transition hover:border-neutral-500 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300'
  const content = (
    <>
      <p className="text-sm text-neutral-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${valueClassName}`}>{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{detail}</p>
      {helper ? (
        <p className="mt-2 text-xs text-neutral-500">{helper}</p>
      ) : null}
      {href ? (
        <p className="mt-3 text-xs font-semibold text-neutral-300">
          Abrir detalle
        </p>
      ) : null}
    </>
  )

  if (href) {
    return (
      <Link aria-label={`${label}: abrir detalle`} className={className} href={href}>
        {content}
      </Link>
    )
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      {content}
    </div>
  )
}

function Metric({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link className="rounded border border-neutral-800 p-3" href={href}>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </Link>
  )
}
