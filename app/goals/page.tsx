import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default async function GoalsPage() {
  const { data: goals } = await supabase
    .from('financial_goals')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true })

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">🎯 Goals</h1>

      <Nav />

      <section className="space-y-4">
        {goals?.map((goal) => {
          const target = Number(goal.target_amount || 0)
          const current = Number(goal.current_amount || 0)
          const remaining = target - current

          const today = new Date()
          const targetDate = goal.target_date
            ? new Date(goal.target_date)
            : null

          const monthsRemaining =
            targetDate
              ? Math.max(
                  1,
                  Math.ceil(
                    (targetDate.getTime() - today.getTime()) /
                      (1000 * 60 * 60 * 24 * 30)
                  )
                )
              : 1

          const monthlyRequired = remaining / monthsRemaining

          return (
            <div key={goal.id} className="border rounded p-4 space-y-2">
              <h2 className="text-2xl font-bold">{goal.name}</h2>

              <p>Tipo: {goal.goal_type}</p>
              <p>Fecha objetivo: {goal.target_date || 'N/A'}</p>

              <p>Meta: ${target.toLocaleString()}</p>
              <p>Ahorrado: ${current.toLocaleString()}</p>
              <p>Faltan: ${remaining.toLocaleString()}</p>

              <p className="font-semibold">
                Necesitas ahorrar aprox. ${monthlyRequired.toLocaleString()} / mes
              </p>

              {goal.notes && (
                <p className="text-sm opacity-70">{goal.notes}</p>
              )}
            </div>
          )
        })}
      </section>
    </main>
  )
}