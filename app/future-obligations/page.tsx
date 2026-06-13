import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default async function FutureObligationsPage() {
  const { data: obligations, error } = await supabase
    .from('future_obligations')
    .select('*')
    .order('priority', { ascending: true })

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

  const critical =
    obligations?.filter((item) => item.priority === 'critical') || []

  const high =
    obligations?.filter((item) => item.priority === 'high') || []

  const medium =
    obligations?.filter((item) => item.priority === 'medium') || []

  const low =
    obligations?.filter((item) => item.priority === 'low') || []

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">🔮 Future Obligations</h1>

      <Nav />

      {error && (
        <pre className="border rounded p-4">
          {JSON.stringify(error, null, 2)}
        </pre>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Total Estimado Futuro</h2>
          <p className="text-3xl font-bold">
            ${totalEstimated.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Reserva Mensual Sugerida</h2>
          <p className="text-3xl font-bold">
            ${totalMonthlyReserve.toLocaleString()}
          </p>
        </div>
      </section>

      <ObligationSection title="🔴 Críticas" items={critical} />
      <ObligationSection title="🟠 Altas" items={high} />
      <ObligationSection title="🟡 Medias" items={medium} />
      <ObligationSection title="🟢 Bajas" items={low} />
    </main>
  )
}

function ObligationSection({
  title,
  items,
}: {
  title: string
  items: any[]
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <section className="border rounded p-4">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="border rounded p-4">
            <strong>{item.name}</strong>

            <p>
              Estimado: ${Number(item.estimated_amount || 0).toLocaleString()}
            </p>

            <p>
              Reserva mensual sugerida:{' '}
              ${Number(item.monthly_reserve || 0).toLocaleString()}
            </p>

            <p>Categoría: {item.category}</p>
            <p>Status: {item.status}</p>

            {item.notes && (
              <p className="opacity-70 mt-2">{item.notes}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}