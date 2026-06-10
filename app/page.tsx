import { supabase } from '@/lib/supabase'

export default async function Home() {
  const { data: accounts } = await supabase.from('accounts').select('*')
  const { data: cards } = await supabase.from('credit_cards').select('*')
  const { data: goals } = await supabase.from('goals').select('*')

  const totalDebt = cards?.reduce((sum, card) => sum + Number(card.balance || 0), 0) || 0
  const totalMinimum = cards?.reduce((sum, card) => sum + Number(card.minimum_payment || 0), 0) || 0

  return (
    <main className="p-8 space-y-8">
      <h1 className="text-4xl font-bold">Mansor One</h1>

      <section>
        <h2 className="text-2xl font-semibold">Resumen</h2>
        <p>Deuda total en tarjetas: ${totalDebt.toLocaleString()}</p>
        <p>Pagos mínimos mensuales: ${totalMinimum.toLocaleString()}</p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Cuentas</h2>
        <ul>
          {accounts?.map((account) => (
            <li key={account.id}>{account.name}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Tarjetas</h2>
        <ul>
          {cards?.map((card) => (
            <li key={card.id}>
              {card.name} - Balance: ${Number(card.balance || 0).toLocaleString()} - Pago mínimo: ${Number(card.minimum_payment || 0).toLocaleString()} - Día pago: {card.due_day || 'N/A'}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Metas</h2>
        <ul>
          {goals?.map((goal) => (
            <li key={goal.id}>
              {goal.name} - Prioridad: {goal.priority}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}