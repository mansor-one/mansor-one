import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

function formatDate(dateString: string | null) {
  if (!dateString) return 'Sin fecha'

  const [year, month, day] = dateString.split('-')
  return `${month}/${day}/${year}`
}

function daysUntil(dateString: string | null) {
  if (!dateString) return null

  const today = new Date()
  const target = new Date(`${dateString}T00:00:00`)
  const diffMs = target.getTime() - today.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

function weeklyReserve(amount: number, dateString: string | null) {
  const days = daysUntil(dateString)

  if (!days || days <= 0) return amount

  const weeks = Math.max(days / 7, 1)
  return amount / weeks
}

export default async function FutureObligationsPage() {
  const { data: obligations, error } = await supabase
    .from('future_obligations')
    .select('*')
    .order('target_date', { ascending: true })

  const totalEstimated =
    obligations?.reduce(
      (sum, item) => sum + Number(item.estimated_amount || 0),
      0
    ) || 0

  const totalMonthlyReserve =
    obligations?.reduce(
      (sum, item) => sum + Number(item.monthly_reserve || 0),
      0
    ) || 0

  const totalWeeklyNeeded =
    obligations?.reduce(
      (sum, item) =>
        sum +
        weeklyReserve(
          Number(item.estimated_amount || 0),
          item.target_date
        ),
      0
    ) || 0

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">🔮 Future Obligations</h1>

      <Nav />

      {error && (
        <pre className="border rounded p-4">
          {JSON.stringify(error, null, 2)}
        </pre>
      )}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Total Estimado Futuro</h2>
          <p className="text-3xl font-bold">
            ${totalEstimated.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Reserva Mensual Actual</h2>
          <p className="text-3xl font-bold">
            ${totalMonthlyReserve.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Reserva Semanal Necesaria</h2>
          <p className="text-3xl font-bold">
            ${totalWeeklyNeeded.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        {obligations?.map((item) => {
          const days = daysUntil(item.target_date)
          const weekly = weeklyReserve(
            Number(item.estimated_amount || 0),
            item.target_date
          )

          return (
            <div key={item.id} className="border rounded p-4 space-y-1">
              <h2 className="font-bold text-xl">{item.name}</h2>

              <p>
                Estimado: $
                {Number(item.estimated_amount || 0).toLocaleString()}
              </p>

              <p>Fecha objetivo: {formatDate(item.target_date)}</p>

              <p>
                Días restantes:{' '}
                {days === null ? 'Sin fecha' : days}
              </p>

              <p>
                Reserva semanal necesaria: $
                {weekly.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </p>

              <p>
                Reserva mensual actual: $
                {Number(item.monthly_reserve || 0).toLocaleString()}
              </p>

              <p>Categoría: {item.category}</p>
              <p>Prioridad: {item.priority}</p>
              <p>Status: {item.status}</p>

              {item.notes && (
                <p className="opacity-70 mt-2">Notas: {item.notes}</p>
              )}
            </div>
          )
        })}
      </section>
    </main>
  )
}