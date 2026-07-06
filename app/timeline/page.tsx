import { requireUser } from '@/lib/auth/requireUser'
import {
  getTimelineProjection,
  type TimelineProjectionEvent,
} from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Nav from '../components/Nav'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Timeline | Mansor One',
}

function formatDate(dateString: string | null) {
  if (!dateString) return 'N/A'

  const [year, month, day] = dateString.split('-')
  return `${month}/${day}/${year}`
}

function money(value: number) {
  return `$${Number(value || 0).toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`
}

function signedMoney(value: number) {
  return `${value >= 0 ? '+' : '-'}${money(Math.abs(value))}`
}

function EventList({
  emptyText,
  events,
}: {
  emptyText: string
  events: TimelineProjectionEvent[]
}) {
  if (events.length === 0) {
    return <p className="text-sm opacity-70">{emptyText}</p>
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div className="rounded border p-3 text-sm" key={`${event.type}:${event.title}:${event.date}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{event.title}</p>
              <p className="opacity-70">
                {event.type === 'payment' ? 'Due' : 'Expected'}:{' '}
                {formatDate(event.dueDate)}
              </p>
            </div>
            <strong>{signedMoney(event.amount)}</strong>
          </div>

          {event.graceUntilDate && (
            <p className="mt-1 opacity-70">
              Grace until {formatDate(event.graceUntilDate)}
              {event.isInGracePeriod ? ' · inside grace period' : ''}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

export default async function TimelinePage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const projection = await getTimelineProjection(supabase, user.id)
  const { explanation } = projection

  return (
    <main className="space-y-6 p-8">
      <h1 className="text-4xl font-bold">Timeline</h1>

      <Nav />

      <section className="rounded border p-4 text-sm">
        <p className="font-semibold">This is a projection, not your bank balance.</p>
        <p className="opacity-70">
          It assumes currently loaded open commitments are paid.
        </p>
      </section>

      <section id="projection" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded border p-4">
          <h2 className="font-semibold">Dinero inicial disponible</h2>
          <p className="text-3xl font-bold">
            {money(projection.startingCash)}
          </p>
        </div>

        <div className="rounded border p-4">
          <h2 className="font-semibold">Punto más bajo proyectado</h2>
          <p
            className={`text-3xl font-bold ${
              projection.minimumBalance < 0 ? 'text-red-600' : ''
            }`}
          >
            {money(projection.minimumBalance)}
          </p>
        </div>

        <div className="rounded border p-4">
          <h2 className="font-semibold">Balance final proyectado</h2>
          <p className="text-3xl font-bold">
            {money(projection.finalBalance)}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div id="lowest-point" className="space-y-3 rounded border p-4">
          <h2 className="text-xl font-bold">Initial Available Cash</h2>
          <p className="text-2xl font-bold">
            {money(explanation.initialCash.balance)}
          </p>
          <p className="text-sm opacity-70">{explanation.initialCash.text}</p>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 xl:grid-cols-1">
            <p>Connected cash: {money(explanation.initialCash.connectedCash)}</p>
            <p>Manual cash: {money(explanation.initialCash.manualCash)}</p>
          </div>
        </div>

        <div className="space-y-3 rounded border p-4">
          <h2 className="text-xl font-bold">Lowest Projected Balance</h2>
          <p className="text-2xl font-bold">
            {money(explanation.lowestPoint.balance)}
          </p>
          <p className="text-sm opacity-70">{explanation.lowestPoint.text}</p>
          <p className="text-sm">
            Date: {formatDate(explanation.lowestPoint.date)}
          </p>
          <div className="space-y-2">
            <h3 className="font-semibold">Payments causing the drop</h3>
            <EventList
              emptyText="No payments on the lowest projected date."
              events={explanation.lowestPoint.payments}
            />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">Income on that date</h3>
            <EventList
              emptyText="No income events on the lowest projected date."
              events={explanation.lowestPoint.incomeEvents}
            />
          </div>
        </div>

        <div className="space-y-3 rounded border p-4">
          <h2 className="text-xl font-bold">Final Projected Balance</h2>
          <p className="text-2xl font-bold">
            {money(explanation.finalBalance.balance)}
          </p>
          <p className="text-sm opacity-70">{explanation.finalBalance.text}</p>
          <div className="space-y-1 text-sm">
            <p>Total loaded income: {money(explanation.finalBalance.totalIncome)}</p>
            <p>
              Total loaded open commitments:{' '}
              {money(explanation.finalBalance.totalPayments)}
            </p>
            <p>
              Open commitments counted:{' '}
              {explanation.finalBalance.openCommitmentsCount}
            </p>
            <p>
              Income events counted: {explanation.finalBalance.incomeEventsCount}
            </p>
          </div>
        </div>
      </section>

      <section id="payments" className="space-y-4">
        {projection.events.map((event, index) => (
          <div className="rounded border p-4" key={`${event.date}:${event.title}:${index}`}>
            <h2 className="text-xl font-bold">
              {event.type === 'income' ? 'Income' : 'Payment'} · {event.title}
            </h2>

            <p>
              {event.type === 'payment' ? 'Vence' : 'Fecha'}:{' '}
              {formatDate(event.dueDate)}
            </p>

            {event.graceUntilDate && (
              <p>
                Gracia hasta: {formatDate(event.graceUntilDate)}
                {event.isInGracePeriod ? ' · dentro del periodo de gracia' : ''}
              </p>
            )}

            <p>Monto: {signedMoney(event.amount)}</p>

            <p>Estado: {event.status}</p>

            <p className="font-bold">
              Balance proyectado después: {money(event.balanceAfter)}
            </p>

            {event.notes && (
              <p className="mt-2 text-sm opacity-70">Notas: {event.notes}</p>
            )}
          </div>
        ))}
      </section>
    </main>
  )
}
