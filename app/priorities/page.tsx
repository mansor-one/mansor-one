import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default async function PrioritiesPage() {
  const { data: priorities } = await supabase
    .from('priorities')
    .select('*')
    .order('amount', { ascending: false })

  const critical =
    priorities?.filter((p) => p.priority_level === 'critical') || []

  const high =
    priorities?.filter((p) => p.priority_level === 'high') || []

  const medium =
    priorities?.filter((p) => p.priority_level === 'medium') || []

  const low =
    priorities?.filter((p) => p.priority_level === 'low') || []

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
  items: any[]
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