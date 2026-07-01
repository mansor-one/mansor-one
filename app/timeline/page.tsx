import { requireUser } from '@/lib/auth/requireUser'
import { getDashboardSummary } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Nav from '../components/Nav'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Timeline | Mansor One',
}

function formatDate(dateString: string) {
  const [year, month, day] = dateString.split('-')
  return `${month}/${day}/${year}`
}

type TimelineEvent = {
  date: string
  title: string
  amount: number
  type: 'income' | 'payment'
  status: string
  notes: string
}

export default async function TimelinePage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const { liquidity } = await getDashboardSummary(supabase, user.id)

  const startingCash = liquidity.cashAvailableTotal

  const incomeEvents =
    liquidity.confirmedIncome
      ?.filter((income) => income.next_expected_date && income.amount)
      .map((income): TimelineEvent => ({
        date: income.next_expected_date || '',
        title: income.name || 'Ingreso',
        amount: Number(income.amount || 0),
        type: 'income',
        status: 'confirmed',
        notes: '',
      })) || []

  const paymentEvents =
    liquidity.lifecyclePayments
      .filter((payment) => payment.lifecycleIsOpen !== false)
      .filter(
        (payment): payment is typeof payment & { effective_due_date: string } =>
          Boolean(payment.effective_due_date)
      )
      .map((payment): TimelineEvent => ({
        date: payment.effective_due_date,
        title: payment.name || 'Pago',
        amount: -Number(payment.amount || 0),
        type: 'payment',
        status: payment.lifecycleLabel || payment.status || 'pending',
        notes: payment.notes || '',
      })) || []

  const events = [...incomeEvents, ...paymentEvents].sort((a, b) => {
    if (a.date === b.date) return b.amount - a.amount
    return a.date.localeCompare(b.date)
  })

  const timelineState = events.reduce(
    (state, event) => {
      const balanceAfter = state.runningBalance + event.amount

      return {
        runningBalance: balanceAfter,
        timeline: [
          ...state.timeline,
          {
            ...event,
            balanceAfter,
          },
        ],
      }
    },
    {
      runningBalance: startingCash,
      timeline: [] as Array<
        (typeof events)[number] & { balanceAfter: number }
      >,
    }
  )

  const { runningBalance, timeline } = timelineState

  const minimumBalance = timeline.reduce(
    (min, event) => Math.min(min, event.balanceAfter),
    startingCash
  )

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">📅 Timeline</h1>

      <Nav />

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Dinero inicial disponible</h2>
          <p className="text-3xl font-bold">
            ${startingCash.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Punto más bajo proyectado</h2>
          <p
            className={`text-3xl font-bold ${
              minimumBalance < 0 ? 'text-red-600' : ''
            }`}
          >
            ${minimumBalance.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Balance final proyectado</h2>
          <p className="text-3xl font-bold">
            ${runningBalance.toLocaleString()}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        {timeline.map((event, index) => (
          <div key={index} className="border rounded p-4">
            <h2 className="text-xl font-bold">
              {event.type === 'income' ? '🟢' : '🔴'} {event.title}
            </h2>

            <p>Fecha: {formatDate(event.date)}</p>

            <p>
              Monto: {event.amount >= 0 ? '+' : '-'}$
              {Math.abs(event.amount).toLocaleString()}
            </p>

            <p>Estado: {event.status}</p>

            <p className="font-bold">
              Balance proyectado después: $
              {event.balanceAfter.toLocaleString()}
            </p>

            {event.notes && (
              <p className="text-sm opacity-70 mt-2">
                Notas: {event.notes}
              </p>
            )}
          </div>
        ))}
      </section>
    </main>
  )
}
