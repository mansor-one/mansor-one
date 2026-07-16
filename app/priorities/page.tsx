import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

type Priority = {
  id: string
  name: string | null
  amount: number | string | null
  priority_level: 'critical' | 'high' | 'medium' | 'low' | string | null
  status: string | null
  notes: string | null
}

export default async function PrioritiesPage() {
  const { data: priorities } = await supabase
    .from('priorities')
    .select('*')
    .order('amount', { ascending: false })

  const items = ((priorities || []) as Priority[])

  const critical =
    items.filter((p) => p.priority_level === 'critical') || []

  const high =
    items.filter((p) => p.priority_level === 'high') || []

  const medium =
    items.filter((p) => p.priority_level === 'medium') || []

  const low =
    items.filter((p) => p.priority_level === 'low') || []

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">🎯 Prioridades</h1>

      <Nav />

      <PrioritySection
        title="🔴 Críticas"
        items={critical}
      />

      <PrioritySection
        title="🟠 Altas"
        items={high}
      />

      <PrioritySection
        title="🟡 Medias"
        items={medium}
      />

      <PrioritySection
        title="🟢 Bajas"
        items={low}
      />
    </main>
  )
}

function PrioritySection({
  title,
  items,
}: {
  title: string
  items: Priority[]
}) {
  return (
    <section className="border rounded p-4">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="border rounded p-4"
          >
            <strong>{item.name}</strong>

            <p>
              ${Number(item.amount || 0).toLocaleString()}
            </p>

            <p>Status: {item.status}</p>

            {item.notes && (
              <p className="opacity-70">
                {item.notes}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
