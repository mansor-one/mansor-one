import { requireUser } from '@/lib/auth/requireUser'
import Nav from '../components/Nav'

function money(value: number | null) {
  return `$${Number(value || 0).toLocaleString()}`
}

export default async function PlanningPage() {
    const { supabase } = await requireUser()
  const { data: items, error } = await supabase
    .from('planning_items')
    .select('*')
    .order('priority_level', { ascending: true })
    .order('due_date', { ascending: true })

  if (error) {
    return (
      <main className="p-8">
        <Nav />
        <div className="border rounded p-4">
          {error.message}
        </div>
      </main>
    )
  }

  const active = items?.filter(i => !i.is_archived && !i.is_completed) || []

  const critical = active.filter(i => i.priority_level === 'critical')
  const regular = active.filter(i => i.priority_level === 'regular')
  const low = active.filter(i => i.priority_level === 'non_critical')

  const completed =
    items?.filter(i => i.is_completed || i.is_archived) || []

  const totalTarget =
    active.reduce((s, i) => s + Number(i.target_amount || 0), 0)

  const totalAssigned =
    active.reduce((s, i) => s + Number(i.current_amount || 0), 0)

  return (
    <main className="p-8 space-y-8">

      <h1 className="text-4xl font-bold">
        🎯 Priorities & Funds
      </h1>

      <Nav />

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">

        <div className="border rounded p-4">
          <h2 className="font-semibold">Target Amount</h2>
          <p className="text-3xl font-bold">
            {money(totalTarget)}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Assigned</h2>
          <p className="text-3xl font-bold">
            {money(totalAssigned)}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Remaining</h2>
          <p className="text-3xl font-bold">
            {money(totalTarget - totalAssigned)}
          </p>
        </div>

      </section>

      <PlanningSection
        title="🔴 Critical"
        items={critical}
      />

      <PlanningSection
        title="🟠 Regular"
        items={regular}
      />

      <PlanningSection
        title="🟢 Non Critical"
        items={low}
      />

      <PlanningSection
        title="✅ Completed / Archived"
        items={completed}
      />

    </main>
  )
}

function PlanningSection({
  title,
  items,
}: {
  title: string
  items: any[]
}) {

  return (
    <section className="space-y-4">

      <h2 className="text-2xl font-bold">
        {title}
      </h2>

      {items.length === 0 && (
        <div className="border rounded p-4">
          No items.
        </div>
      )}

      {items.map(item => {

        const percent =
          item.target_amount > 0
            ? Math.round(
                (Number(item.current_amount || 0) /
                  Number(item.target_amount)) *
                  100
              )
            : 0

        return (

          <div
            key={item.id}
            className="border rounded p-4 space-y-2"
          >

            <div className="flex justify-between">

              <div>

                <h3 className="text-xl font-semibold">
                  {item.name}
                </h3>

                <p>
                  {item.item_type}
                </p>

              </div>

              <div>

                {item.status}

              </div>

            </div>

            <p>

              Target:
              {' '}
              {money(item.target_amount)}

            </p>

            <p>

              Assigned:
              {' '}
              {money(item.current_amount)}

            </p>

            <div className="w-full border rounded h-4">

              <div
                className="bg-green-500 h-4 rounded"
                style={{
                  width: `${Math.min(percent,100)}%`,
                }}
              />

            </div>

            <p>

              {percent}% funded

            </p>

            <p>

              Due:
              {' '}
              {item.due_date || 'N/A'}

            </p>

            <p>

              Owner:
              {' '}
              {item.owner || 'N/A'}

            </p>

          </div>

        )

      })}

    </section>
  )

}