import { requireUser } from '@/lib/auth/requireUser'
import { getTimelineProjection, type TimelineHorizonDays, type TimelineProjectionEvent, type TrustedPayment } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import AppShell from '../components/AppShell'

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

function EventCard({ event }: { event: TimelineProjectionEvent }) {
  return <div className="rounded border p-4 text-sm">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="font-bold">{event.title}</h3><p className="opacity-70">Due {formatDate(event.dueDate)}</p></div>
      <strong>{event.amount >= 0 ? '+' : '-'}{money(Math.abs(event.amount))}</strong>
    </div>
    {event.graceUntilDate && <p>Grace: {formatDate(event.graceUntilDate)}{event.isInGracePeriod ? ' · active' : ''}</p>}
    <p>Status: {event.status.replaceAll('_', ' ')}</p>
    {event.matchingInformation && <p>Match: {event.matchingInformation}</p>}
    <p>Source: {event.sourceOfTruth}</p>
    <p>Action: {event.availableAction}</p>
    <p className="font-semibold">Projected balance after: {money(event.balanceAfter)}</p>
    {event.notes && <p className="mt-1 opacity-70">{event.notes}</p>}
  </div>
}

function PaymentCard({ payment }: { payment: TrustedPayment }) {
  return <div className="rounded border p-4 text-sm">
    <div className="flex justify-between gap-2"><strong>{payment.name || 'Payment'}</strong><strong>{money(Number(payment.amount || 0))}</strong></div>
    <p>Due: {formatDate(payment.due_date || payment.expected_date || payment.effective_due_date || null)}</p>
    <p>Status: {payment.truthStatus.replaceAll('_', ' ')}</p>
    <p>Source: {payment.sourceOfTruth}</p>
    <p>Action: {payment.availableAction}</p>
    <p className="opacity-70">{payment.truthReasons.join(' ')}</p>
  </div>
}

function EventSection({ title, events, empty }: { title: string; events: TimelineProjectionEvent[]; empty: string }) {
  return <section className="space-y-3"><h2 className="text-xl font-bold">{title}</h2>{events.length ? <div className="grid gap-3 lg:grid-cols-2">{events.map((event) => <EventCard event={event} key={`${event.type}:${event.id}`} />)}</div> : <p className="text-sm opacity-70">{empty}</p>}</section>
}

export default async function TimelinePage({ searchParams }: { searchParams: Promise<{ horizon?: string }> }) {
  const query = await searchParams
  const requested = Number(query.horizon)
  const horizonDays: TimelineHorizonDays = [30, 45, 90, 365].includes(requested) ? requested as TimelineHorizonDays : 45
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const projection = await getTimelineProjection(supabase, user.id, { horizonDays })
  const { diagnostics, explanation, sections } = projection

  return <AppShell header={{ eyebrow: 'Calendario de efectivo', title: 'Pagos', subtitle: `Payment truth from today through ${formatDate(projection.horizonEnd)}. Possible matches are not silently treated as paid.` }}>
    <nav className="flex flex-wrap gap-2" aria-label="Planning horizon">
      {[30, 45, 90, 365].map((days) => <Link className={`rounded border px-3 py-2 text-sm ${days === horizonDays ? 'font-bold' : ''}`} href={`/timeline?horizon=${days}`} key={days}>{days === 365 ? 'Full year' : `${days} days`}</Link>)}
    </nav>

    <section id="projection" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {[
        ['Available cash today', projection.startingCash],
        ['Expected income', projection.expectedIncomeTotal],
        ['Open actionable payments', projection.actionablePaymentTotal],
        ['Paid or matched', projection.paidOrMatchedTotal],
        ['Lowest projected balance', projection.minimumBalance],
        ['Final projected balance', projection.finalBalance],
      ].map(([label, value]) => <div className="rounded border p-4" key={String(label)}><h2 className="text-sm font-semibold">{label}</h2><p className="text-2xl font-bold">{money(Number(value))}</p></div>)}
    </section>

    {projection.threePaycheckMonths.map((item) => <div className="rounded border p-4" key={`${item.owner}:${item.month}`}><strong>{item.owner} receives {item.count} paychecks in {item.month}.</strong></div>)}

    <EventSection title="Needs attention" events={sections.needsAttention} empty="Nothing overdue, due today, or in grace inside this horizon." />
    <EventSection title="Upcoming" events={sections.upcoming} empty="No upcoming payment or income events are complete enough to project." />
    <EventSection title="Possible matches" events={sections.possibleMatches} empty="No uncertain transaction matches need confirmation." />

    <section id="payments" className="space-y-3"><h2 className="text-xl font-bold">Paid or reconciled</h2>{sections.paidOrReconciled.length ? <div className="grid gap-3 lg:grid-cols-2">{sections.paidOrReconciled.map((payment) => <PaymentCard payment={payment} key={payment.id} />)}</div> : <p className="text-sm opacity-70">No paid or reliably matched instances loaded.</p>}</section>
    <section className="space-y-3"><h2 className="text-xl font-bold">Later</h2>{sections.later.length ? <div className="grid gap-3 lg:grid-cols-2">{sections.later.map((payment) => <PaymentCard payment={payment} key={payment.id} />)}</div> : <p className="text-sm opacity-70">No payment instances outside this horizon are loaded.</p>}</section>

    <section id="lowest-point" className="grid gap-3 lg:grid-cols-3">
      <div className="rounded border p-4"><h2 className="font-bold">Initial cash</h2><p>{money(explanation.initialCash.balance)}</p><p className="text-sm opacity-70">{explanation.initialCash.text}</p></div>
      <div className="rounded border p-4"><h2 className="font-bold">Lowest point</h2><p>{money(explanation.lowestPoint.balance)} · {formatDate(explanation.lowestPoint.date)}</p><p className="text-sm opacity-70">{explanation.lowestPoint.text}</p></div>
      <div className="rounded border p-4"><h2 className="font-bold">Final balance</h2><p>{money(explanation.finalBalance.balance)}</p><p className="text-sm opacity-70">Income {money(explanation.finalBalance.totalIncome)} · payments {money(explanation.finalBalance.totalPayments)}</p></div>
    </section>

    <details className="rounded border p-4"><summary className="font-bold">Diagnostics</summary><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(diagnostics).map(([key, value]) => <p key={key}>{key.replaceAll(/([A-Z])/g, ' $1')}: {value}</p>)}
    </div></details>
  </AppShell>
}
