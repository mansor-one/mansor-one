import { requireUser } from '@/lib/auth/requireUser'
import type { Metadata } from 'next'
import {
  canonicalCategoryCodeForText,
  commonMerchantDefaultCategoryCode,
  getCategoryByCode,
  getDashboardSummary,
  getPortfolioSummary,
  getReviewQueue,
  type LedgerSummaryTransaction,
  type PaymentInstance,
  transactionContext,
  type TransactionContext,
} from '@/lib/financial-engine'
import Link from 'next/link'
import InstitutionLogo from './components/InstitutionLogo'
import Nav from './components/Nav'

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
}

type HealthStatus = {
  label: 'Estable' | 'Ajustado' | 'Riesgo'
  tone: 'green' | 'yellow' | 'red'
  detail: string
}

type PaymentTrafficLight = {
  payment: PaymentInstance
  tone: 'green' | 'yellow' | 'red'
  label: string
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

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function daysBetween(from: Date, toDateString: string | null | undefined) {
  if (!toDateString) return null

  const dueDate = new Date(`${toDateString}T00:00:00`)
  const currentDate = new Date(from)
  currentDate.setHours(0, 0, 0, 0)

  return Math.ceil(
    (dueDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
  )
}

function categoryFromCode(code: string | null) {
  return code ? getCategoryByCode(code) : null
}

function resolvedCategoryCode(transaction: LedgerSummaryTransaction) {
  const ledgerCategoryCode = canonicalCategoryCodeForText(transaction.category)
  const merchantDefaultCode = commonMerchantDefaultCategoryCode(
    transaction.description
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
  transaction: LedgerSummaryTransaction
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
  }
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

function paymentTrafficLight(
  payment: PaymentInstance,
  now: Date
): PaymentTrafficLight {
  const days = daysBetween(now, payment.effective_due_date)

  if (payment.lifecycleState === 'overdue') {
    return {
      payment,
      tone: 'red',
      label:
        payment.daysFromDueDate && payment.daysFromDueDate > 0
          ? `Venció hace ${payment.daysFromDueDate} días`
          : 'Venció',
    }
  }

  if (days === null) {
    return {
      payment,
      tone: 'yellow',
      label: 'Sin fecha confirmada',
    }
  }

  if (days < 0) {
    return {
      payment,
      tone: 'red',
      label: `Venció hace ${Math.abs(days)} días`,
    }
  }

  if (days <= 7) {
    return {
      payment,
      tone: 'yellow',
      label: days === 0 ? 'Vence hoy' : `Vence en ${days} días`,
    }
  }

  return {
    payment,
    tone: 'green',
    label: `Vence en ${days} días`,
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

function tonePriority(tone: 'green' | 'yellow' | 'red') {
  if (tone === 'red') return 0
  if (tone === 'yellow') return 1

  return 2
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

function robototinaBriefing({
  greeting,
  household,
  trafficLights,
  reviewPercent,
  pendingCount,
  topCategory,
  monthlySpent,
}: {
  greeting: string
  household: string
  trafficLights: PaymentTrafficLight[]
  reviewPercent: number
  pendingCount: number
  topCategory: ReturnType<typeof topCategories>[number] | undefined
  monthlySpent: number
}) {
  const lines = [`${greeting} ${household}. Estas son las cosas importantes de hoy:`]
  const urgentPayment =
    trafficLights.find((item) => item.tone === 'red') ||
    trafficLights.find((item) => item.tone === 'yellow')

  if (urgentPayment) {
    lines.push(
      `${toneDot(urgentPayment.tone)} ${
        urgentPayment.payment.name || 'Un pago'
      } ${urgentPayment.label.toLowerCase()}.`
    )
  }

  lines.push(
    `🟢 Ya clasificaron el ${reviewPercent}% de los movimientos del mes.`
  )

  if (pendingCount > 0) {
    lines.push(
      `📝 Solo faltan ${pendingCount} movimientos para completar este mes.`
    )
  }

  if (topCategory && monthlySpent > 0) {
    const share = Math.round((topCategory.amount / monthlySpent) * 100)
    lines.push(
      `💡 ${topCategory.category} representa el ${share}% del gasto mensual.`
    )
  }

  return lines
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

  const [dashboardSummary, portfolioSummary, reviewQueue] = await Promise.all([
    getDashboardSummary(supabase, user.id),
    getPortfolioSummary(supabase, user.id),
    getReviewQueue(supabase, user.id),
  ])

  const { liquidity, planning } = dashboardSummary
  const ledgerSummary = reviewQueue.source.ledgerSummary
  const household = householdGreeting()
  const greeting = timeOfDayGreeting(now)
  const confirmedMovements = dedupeMovements(
    ledgerSummary.confirmedLedgerEntries
      .map(movementFromTransaction)
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
  const paymentLights = upcomingPayments.map((payment) =>
    paymentTrafficLight(payment, now)
  )
    .sort(
      (a, b) =>
        tonePriority(a.tone) - tonePriority(b.tone) ||
        String(a.payment.effective_due_date || '').localeCompare(
          String(b.payment.effective_due_date || '')
        )
    )
    .slice(0, 3)
  const planningItems = planning.planningItems.slice(0, 3)
  const nextPlanningItem = planningItems[0]
  const health = financialHealth(
    portfolioSummary.totalLiquidAvailable,
    liquidity.committedPaymentsTotal,
    liquidity.resultToday
  )
  const methodSplit = paymentMethodSplit(spendingMovements)
  const reviewPercent = reviewProgress(
    currentMonthMovements.length,
    reviewQueue.statistics.totalCandidates
  )
  const briefingLines = robototinaBriefing({
    greeting,
    household,
    trafficLights: paymentLights,
    reviewPercent,
    pendingCount: reviewQueue.statistics.totalCandidates,
    topCategory,
    monthlySpent,
  })
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
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8">
        <header className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm text-neutral-400">{currentMonth}</p>
              <h1 className="text-3xl font-bold md:text-5xl">
                👋 {greeting}, {household}.
              </h1>
            </div>

            <div className="text-sm text-neutral-400 md:text-right">
              <p>Actualizado: {lastUpdated}</p>
              <p>Movimientos confirmados y pendientes al día.</p>
            </div>
          </div>

          <Nav />
        </header>

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
          </div>
          <SummaryCard
            label="Gastado este mes"
            value={money(monthlySpent)}
            detail={`${spendingMovements.length} movimientos`}
          />
          <SummaryCard
            label="Gastado esta quincena"
            value={money(quincenaSpent)}
            detail={`Desde ${startOfQuincena}`}
          />
          <SummaryCard
            label="Pendientes por clasificar"
            value={reviewQueue.statistics.totalCandidates}
            detail="Pendientes por clasificar"
          />
          <SummaryCard
            label="Movimientos no-gasto"
            value={nonSpendingMovements.length}
            detail="Pagos y transferencias"
          />
          <SummaryCard
            label="Próximos pagos"
            value={money(liquidity.committedPaymentsTotal)}
            detail={`${liquidity.committedPayments.length} abiertos`}
          />
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="🏆 Mayor gasto"
            value={largestTransaction?.merchant || 'Sin datos'}
            detail={largestTransaction ? money(largestTransaction.amount) : ''}
          />
          <SummaryCard
            label="🍽 Categoría principal"
            value={topCategory?.category || 'Sin datos'}
            detail={topCategory ? money(topCategory.amount) : ''}
          />
          <SummaryCard
            label="💳 Uso de crédito"
            value={`${methodSplit.creditPercent}%`}
            detail={`Débito ${methodSplit.debitPercent}%`}
          />
          <SummaryCard
            label="🎯 Fondo más cercano"
            value={nextPlanningItem?.name || 'Sin configurar'}
            detail={
              nextPlanningItem
                ? `${nextPlanningItem.due_date || 'Sin fecha'} · ${money(
                    nextPlanningItem.target_amount
                  )}`
                : 'Planning todavía necesita configuración'
            }
          />
        </section>

        {methodSplit.credit > methodSplit.debit && (
          <section className="rounded-lg border border-amber-700 bg-amber-950/40 p-4 text-sm">
            ⚠️ Este mes estás utilizando más crédito que efectivo.
          </section>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Gastos por categoría</h2>
                <p className="text-sm text-neutral-400">
                  Top 5 del mes actual
                </p>
              </div>
              <Link className="rounded border border-neutral-700 px-3 py-2 text-sm" href="/spending">
                Ver gastos
              </Link>
            </div>

            <div className="space-y-2">
              {categoryRows.length > 0 ? (
                categoryRows.map((row) => (
                  <div
                    className="grid grid-cols-3 gap-3 border-t border-neutral-800 py-3 text-sm"
                    key={row.category}
                  >
                    <span className="font-medium">{row.category}</span>
                    <span>{money(row.amount)}</span>
                    <span className="text-neutral-400">
                      {row.count} movimientos
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-neutral-400">
                  Todavía no hay gastos confirmados este mes.
                </p>
              )}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 border-t border-neutral-800 pt-4 md:grid-cols-3">
              <InsightBlock
                label="Mayor categoría"
                value={topCategory?.category || 'Sin datos'}
                detail={topCategory ? money(topCategory.amount) : ''}
              />
              <InsightBlock
                label="Mayor comercio"
                value={topMerchant?.merchant || 'Sin datos'}
                detail={topMerchant ? money(topMerchant.amount) : ''}
              />
              <InsightBlock
                label="Mayor compra"
                value={largestTransaction?.merchant || 'Sin datos'}
                detail={largestTransaction ? money(largestTransaction.amount) : ''}
              />
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
                href="/lab/review-queue"
              >
                Revisar movimientos
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Total" value={reviewQueue.statistics.totalCandidates} />
              <Metric label="Categoría" value={reviewQueue.needsCategory.length} />
              <Metric label="ATH" value={reviewQueue.athReview.length} />
              <Metric label="Similitudes" value={reviewQueue.possibleDuplicate.length} />
              <Metric label="Listos" value={reviewQueue.readyToConfirm.length} />
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
            <div className="rounded border border-neutral-800 p-3">
              <p className="text-sm text-neutral-400">Crédito</p>
              <p className="text-3xl font-bold">{methodSplit.creditPercent}%</p>
              <p className="text-sm text-neutral-400">
                {money(methodSplit.credit)}
              </p>
            </div>
            <div className="rounded border border-neutral-800 p-3">
              <p className="text-sm text-neutral-400">Débito</p>
              <p className="text-3xl font-bold">{methodSplit.debitPercent}%</p>
              <p className="text-sm text-neutral-400">
                {money(methodSplit.debit)}
              </p>
            </div>
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
                className="grid grid-cols-1 gap-1 border-t border-neutral-800 py-3 text-sm md:grid-cols-[0.8fr_1.4fr_0.7fr_1fr_1.2fr]"
                key={movement.id}
              >
                <span className="text-neutral-400">{movement.date}</span>
                <span className="font-medium">{movement.merchant}</span>
                <span>{money(movement.amount)}</span>
                <span>{movement.category}</span>
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
              {briefingLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </section>
        </div>

        {paymentLights.length > 0 && (
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-4 text-xl font-bold">Próximos pagos</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {paymentLights.map((item) => (
                <div
                  className={`rounded border p-3 ${toneClasses(item.tone)}`}
                  key={item.payment.id}
                >
                  <p className="font-medium">
                    {toneDot(item.tone)} {item.payment.name || 'Pago'}
                  </p>
                  <p className="text-sm text-neutral-400">
                    Fecha {item.payment.effective_due_date || 'Sin fecha'}
                  </p>
                  <p className="text-sm text-neutral-300">
                    {item.label}
                  </p>
                  <p className="mt-2 text-lg font-bold">
                    {money(item.payment.amount)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string | number
  detail: string
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-sm text-neutral-400">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{detail}</p>
    </div>
  )
}

function InsightBlock({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded border border-neutral-800 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
      {detail ? <p className="text-sm text-neutral-400">{detail}</p> : null}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-neutral-800 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  )
}
