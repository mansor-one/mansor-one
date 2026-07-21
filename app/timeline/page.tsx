import { requireUser } from '@/lib/auth/requireUser'
import { getTimelineProjection, paymentStatusPresentation, type TimelineHorizonDays, type TimelineProjectionEvent, type TrustedPayment } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import AppShell from '../components/AppShell'
import ConfirmObligationPaid from '../components/ConfirmObligationPaid'
import PaymentScheduleView from '../components/PaymentScheduleView'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Timeline | Mansor One' }

function formatDate(value: string | null) {
  if (!value) return 'N/A'
  const [year, month, day] = value.split('-')
  return `${month}/${day}/${year}`
}

function money(value: number) {
  return `$${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`
}

function EventCard({ event, today }: { event: TimelineProjectionEvent; today: string }) {
  const isIncome = event.type === 'income'
  const status = isIncome ? null : paymentStatusPresentation({ status: event.status, amount: Math.abs(event.amount), dueDate: event.dueDate, graceDate: event.graceUntilDate, confidence: event.matchConfidence ?? null, today })
  return <div className={`rounded border p-4 text-sm ${status?.classes || 'border-slate-700 bg-slate-950/40 text-slate-100'}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="font-bold">{event.title}</h3><p className="opacity-70">Fecha {formatDate(event.dueDate)}</p></div>
      <strong>{event.type === 'payment' && event.amount === 0 ? 'Monto no configurado' : `${event.amount >= 0 ? '+' : '-'}${money(Math.abs(event.amount))}`}</strong>
    </div>
    {status && <div className="mt-2 space-y-1"><span className="inline-flex items-center gap-1 rounded-full border border-current px-2 py-1 font-semibold"><span aria-hidden>{status.icon}</span>{status.label}</span><p>{status.explanation}</p>{status.relativeLabel && <p className="font-semibold">{status.relativeLabel}</p>}{status.confidence !== null && <p className="font-semibold">Confianza: {status.confidence}% · {status.confidenceStrength}</p>}</div>}
    {event.graceUntilDate && <p>Gracia hasta: {formatDate(event.graceUntilDate)}{event.isInGracePeriod ? ' · activa' : ''}</p>}
    {event.matchingInformation && <p>Coincidencia: {event.matchingInformation}</p>}
    <p className="font-semibold">Saldo proyectado después: {money(event.balanceAfter)}</p>
    {event.notes && <p className="mt-1 opacity-70">{event.notes}</p>}
    {event.type === 'payment' && event.amount === 0 && <Link className="mt-2 inline-flex rounded border border-current px-3 py-2 font-semibold" href="/repair-center">Configurar</Link>}
  </div>
}

function PaymentCard({ payment, today }: { payment: TrustedPayment; today: string }) {
  const dueDate = payment.due_date || payment.expected_date || payment.effective_due_date || null
  const match = payment.lifecycleMatchedTransaction
  const status = paymentStatusPresentation({ status: payment.truthStatus, lifecycleState: payment.lifecycleState, amount: payment.amount, dueDate, graceDate: payment.grace_until || payment.grace_due_date, evidenceDate: match?.date || payment.updated_at, reconciledDate: payment.updated_at, confidence: match?.confidence, today })
  const invalidAmount = !(Number(payment.amount || 0) > 0)
  return <div className={`rounded border p-4 text-sm ${status.classes}`}>
    <div className="flex justify-between gap-2"><strong>{payment.name || 'Pago'}</strong><strong>{invalidAmount ? 'Monto no configurado' : money(Number(payment.amount || 0))}</strong></div>
    <p>Vencimiento: {formatDate(payment.due_date || payment.expected_date || payment.effective_due_date || null)}</p>
    <p><span className="inline-flex items-center gap-1 rounded-full border border-current px-2 py-1 font-semibold"><span aria-hidden>{status.icon}</span>{status.label}</span></p>
    <p>{status.explanation}</p>
    {status.relativeLabel && <p className="font-semibold">{status.relativeLabel}</p>}
    {status.confidence !== null && <p className="font-semibold">Confianza: {status.confidence}% · {status.confidenceStrength}</p>}
    {invalidAmount && <Link className="mt-2 inline-flex rounded border border-current px-3 py-2 font-semibold" href="/repair-center">Configurar</Link>}
    {payment.obligationInstanceId && !['paid', 'matched', 'in_transit'].includes(payment.truthStatus) && <ConfirmObligationPaid obligationInstanceId={payment.obligationInstanceId} amount={Number(payment.amount || 0)} defaultPaymentMethod={payment.paymentMethod} />}
  </div>
}

function EventSection({ title, events, empty, today }: { title: string; events: TimelineProjectionEvent[]; empty: string; today: string }) {
  return <section className="space-y-3"><h2 className="text-xl font-bold">{title}</h2>{events.length ? <div className="grid gap-3 lg:grid-cols-2">{events.map((event) => <EventCard event={event} today={today} key={`${event.type}:${event.id}`} />)}</div> : <p className="text-sm opacity-70">{empty}</p>}</section>
}

export default async function TimelinePage({ searchParams }: { searchParams: Promise<{ horizon?: string; view?: string; month?: string }> }) {
  const query = await searchParams
  const requested = Number(query.horizon)
  const horizonDays: TimelineHorizonDays = [30, 45, 90, 365].includes(requested) ? requested as TimelineHorizonDays : 45
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const projection = await getTimelineProjection(supabase, user.id, { horizonDays })
  const { diagnostics, explanation, sections } = projection
  const actionableStatuses = new Set(['possible_match', 'due_soon', 'due_today', 'grace_period', 'overdue', 'needs_review'])
  const actionablePayments = projection.trustedPayments.filter((payment) => actionableStatuses.has(payment.truthStatus))
  const openStatuses = new Set(['possible_match', 'unpaid', 'due_soon', 'due_today', 'grace_period', 'overdue', 'needs_review'])
  const adjustedRiskStatuses = new Set(['possible_match', 'unpaid', 'due_soon', 'due_today', 'grace_period', 'overdue', 'needs_review'])
  const openPayments = projection.trustedPayments.filter((payment) => openStatuses.has(payment.truthStatus))
  const adjustedRiskPayments = projection.trustedPayments.filter((payment) => adjustedRiskStatuses.has(payment.truthStatus))
  const incomeEvents = projection.events.filter((event) => event.type === 'income' && (!query.month || event.date.startsWith(query.month)))
  const isActionableDrilldown = query.view === 'actionable'
  const isOpenDrilldown = query.view === 'open'
  const isAdjustedRiskDrilldown = query.view === 'adjusted-risk'
  const isIncomeDrilldown = query.view === 'income'
  const drilldownPayments = isOpenDrilldown ? openPayments : isAdjustedRiskDrilldown ? adjustedRiskPayments : actionablePayments

  return <AppShell header={{ eyebrow: 'Calendario de efectivo', title: 'Pagos', subtitle: `Obligaciones desde hoy hasta ${formatDate(projection.horizonEnd)}. Las coincidencias posibles requieren confirmación.` }}>
    <nav className="flex flex-wrap gap-2" aria-label="Horizonte de planificación">
      {[30, 45, 90, 365].map((days) => <Link className={`rounded border px-3 py-2 text-sm ${days === horizonDays ? 'font-bold' : ''}`} href={`/timeline?horizon=${days}${query.view ? `&view=${query.view}` : ''}${query.month ? `&month=${query.month}` : ''}#dashboard-calculation`} key={days}>{days === 365 ? 'Año completo' : `${days} días`}</Link>)}
    </nav>

    <PaymentScheduleView payments={projection.trustedPayments} today={projection.asOfDate} initialMonth={query.month} />

    {(isActionableDrilldown || isOpenDrilldown || isAdjustedRiskDrilldown || isIncomeDrilldown) && (
      <section id="dashboard-calculation" className="space-y-3 rounded border border-blue-500 p-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">Cálculo del Dashboard</p>
          <h2 className="text-xl font-bold">{!isIncomeDrilldown ? `${drilldownPayments.length} pagos · ${money(drilldownPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0))}` : `${incomeEvents.length} ingresos · ${money(incomeEvents.reduce((sum, event) => sum + event.amount, 0))}`}</h2>
          <p className="text-sm opacity-70">Se conservaron el horizonte y los filtros usados por el Dashboard.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {!isIncomeDrilldown
            ? drilldownPayments.map((payment) => <PaymentCard payment={payment} today={projection.asOfDate} key={payment.id} />)
            : incomeEvents.map((event) => <EventCard event={event} today={projection.asOfDate} key={`${event.type}:${event.id}`} />)}
        </div>
      </section>
    )}

    <section id="projection" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {[
        ['Efectivo disponible hoy', projection.startingCash],
        ['Ingresos esperados', projection.expectedIncomeTotal],
        ['Pagos abiertos que requieren acción', projection.actionablePaymentTotal],
        ['Pagados o conciliados', projection.paidOrMatchedTotal],
        ['Saldo proyectado más bajo', projection.minimumBalance],
        ['Saldo proyectado final', projection.finalBalance],
      ].map(([label, value]) => <div className="rounded border p-4" key={String(label)}><h2 className="text-sm font-semibold">{label}</h2><p className="text-2xl font-bold">{money(Number(value))}</p></div>)}
    </section>

    {projection.threePaycheckMonths.map((item) => <div className="rounded border p-4" key={`${item.owner}:${item.month}`}><strong>{item.owner} recibe {item.count} pagos de nómina en {item.month}.</strong></div>)}

    <EventSection title="Requieren atención" events={sections.needsAttention} empty="No hay pagos vencidos, para hoy o dentro de gracia en este período." today={projection.asOfDate} />
    <EventSection title="Próximos" events={sections.upcoming} empty="No hay pagos o ingresos próximos listos para proyectar." today={projection.asOfDate} />
    <EventSection title="Coincidencias posibles" events={sections.possibleMatches} empty="No hay coincidencias inciertas que requieran confirmación." today={projection.asOfDate} />

    <section id="in-transit" className="space-y-3"><h2 className="text-xl font-bold">Pagos esperando confirmación</h2>{sections.inTransit.length ? <div className="grid gap-3 lg:grid-cols-2">{sections.inTransit.map((payment) => <PaymentCard payment={payment} today={projection.asOfDate} key={payment.id} />)}</div> : <p className="text-sm opacity-70">No hay pagos recientes esperando confirmación bancaria.</p>}</section>

    <section id="payments" className="space-y-3"><h2 className="text-xl font-bold">Pagados o conciliados</h2>{sections.paidOrReconciled.length ? <div className="grid gap-3 lg:grid-cols-2">{sections.paidOrReconciled.map((payment) => <PaymentCard payment={payment} today={projection.asOfDate} key={payment.id} />)}</div> : <p className="text-sm opacity-70">No hay pagos conciliados en este período.</p>}</section>
    <section className="space-y-3"><h2 className="text-xl font-bold">Más adelante</h2>{sections.later.length ? <div className="grid gap-3 lg:grid-cols-2">{sections.later.map((payment) => <PaymentCard payment={payment} today={projection.asOfDate} key={payment.id} />)}</div> : <p className="text-sm opacity-70">No hay pagos fuera de este horizonte.</p>}</section>

    <section id="lowest-point" className="grid gap-3 lg:grid-cols-3">
      <div className="rounded border p-4"><h2 className="font-bold">Efectivo inicial</h2><p>{money(explanation.initialCash.balance)}</p><p className="text-sm opacity-70">{explanation.initialCash.text}</p></div>
      <div className="rounded border p-4"><h2 className="font-bold">Punto más bajo</h2><p>{money(explanation.lowestPoint.balance)} · {formatDate(explanation.lowestPoint.date)}</p><p className="text-sm opacity-70">{explanation.lowestPoint.text}</p></div>
      <div className="rounded border p-4"><h2 className="font-bold">Saldo final</h2><p>{money(explanation.finalBalance.balance)}</p><p className="text-sm opacity-70">Ingresos {money(explanation.finalBalance.totalIncome)} · pagos {money(explanation.finalBalance.totalPayments)}</p></div>
    </section>

    <details className="rounded border p-4"><summary className="font-bold">Diagnóstico técnico</summary><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(diagnostics).map(([key, value]) => <p key={key}>{key.replaceAll(/([A-Z])/g, ' $1')}: {value}</p>)}
    </div></details>
  </AppShell>
}
