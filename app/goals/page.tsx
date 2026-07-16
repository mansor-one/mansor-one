import { requireUser } from '@/lib/auth/requireUser'
import {
  getLegacyFinancialGoals,
  type LegacyFinancialGoalRow,
} from '@/lib/financial-engine'
import Nav from '../components/Nav'
import { createGoalAction } from './actions'
import GoalCard, { GoalFields } from './GoalCard'

export const dynamic = 'force-dynamic'

type GoalsPageProps = {
  searchParams?: Promise<{
    error?: string
    saved?: string
  }>
}

const savedMessages: Record<string, string> = {
  created: 'Meta creada',
  updated: 'Meta actualizada',
}

export default async function GoalsPage({ searchParams }: GoalsPageProps) {
  const params = (await searchParams) || {}
  const { supabase } = await requireUser()
  let items: LegacyFinancialGoalRow[] = []
  let error: Error | null = null

  try {
    items = await getLegacyFinancialGoals(supabase)
  } catch (caughtError) {
    error = caughtError instanceof Error ? caughtError : new Error(String(caughtError))
  }

  return (
    <main className="space-y-6 p-8">
      <h1 className="text-4xl font-bold">Goals</h1>

      <Nav />

      {params.saved && savedMessages[params.saved] && (
        <div className="rounded border p-3">{savedMessages[params.saved]}</div>
      )}

      {(params.error || error) && (
        <div className="rounded border p-3 text-red-400">
          {params.error || error?.message}
        </div>
      )}

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-2xl font-bold">Nueva Meta</h2>

        <form action={createGoalAction} className="space-y-3">
          <GoalFields />
          <button className="rounded border p-3" type="submit">
            Guardar Meta
          </button>
        </form>
      </section>

      <section className="space-y-4">
        {items.map((goal) => (
          <GoalCard goal={goal} key={goal.id} />
        ))}
      </section>
    </main>
  )
}
