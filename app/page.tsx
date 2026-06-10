import { supabase } from '@/lib/supabase'

export default async function Home() {

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')

  const { data: cards } = await supabase
    .from('credit_cards')
    .select('*')

  const { data: goals } = await supabase
    .from('goals')
    .select('*')

  const totalDebt =
    cards?.reduce(
      (sum, card) => sum + Number(card.balance || 0),
      0
    ) || 0

  const totalMinimum =
    cards?.reduce(
      (sum, card) => sum + Number(card.minimum_payment || 0),
      0
    ) || 0

  return (
    <main className="p-8">

      <h1 className="text-4xl font-bold mb-8">
        Mansor One
      </h1>

      <div className="grid grid-cols-2 gap-4 mb-8">

        <div className="border rounded p-4">
          <h2>💳 Deuda Total</h2>
          <p className="text-2xl font-bold">
            ${totalDebt.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2>💸 Pagos Mínimos</h2>
          <p className="text-2xl font-bold">
            ${totalMinimum.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2>🏦 Cuentas</h2>
          <p className="text-2xl font-bold">
            {accounts?.length || 0}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2>🎯 Metas</h2>
          <p className="text-2xl font-bold">
            {goals?.length || 0}
          </p>
        </div>

      </div>

      <h2 className="text-2xl font-bold mb-2">
        Tarjetas
      </h2>

      <ul>
        {cards?.map((card) => (
          <li key={card.id}>
            {card.name} -
            ${Number(card.balance).toLocaleString()}
          </li>
        ))}
      </ul>

    </main>
  )
}