import { requireUser } from '@/lib/auth/requireUser'
import { getPortfolioSummary } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'
import Nav from '../components/Nav'
export const dynamic = 'force-dynamic'

function formatDate(dateString: string) {
  const [year, month, day] = dateString.split('-')
  return `${month}/${day}/${year}`
}

export default async function TimelinePage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const portfolioSummary = await getPortfolioSummary(supabase, user.id)

  const { data: incomes } = await supabase
    .from('income_schedule')
    .select('*')
    .eq('is_active', true)

  const { data: payments } = await supabase
    .from('payment_instances')
    .select('*')
    .eq('payment_month', month)
    .eq('payment_year', year)
    .neq('status', 'paid')

  const startingCash = portfolioSummary.totalLiquidAvailable

  const incomeEvents =
    incomes
      ?.filter((income) => income.next_expected_date && income.amount)
      .map((income) => ({
        date: income.next_expected_date,
        title: income.name,
        amount: Number(income.amount || 0),
        type: 'income',
        status: income.confidence || 'confirmed',
        notes: income.notes || '',
      })) || []

  const paymentEvents =
    payments
      ?.filter((payment) => payment.effective_due_date)
      .map((payment) => ({
        date: payment.effective_due_date,
        title: payment.name,
        amount: -Number(payment.amount || 0),
        type: 'payment',
        status: payment.status || 'pending',
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
