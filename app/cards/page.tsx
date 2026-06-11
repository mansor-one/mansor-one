import { supabase } from '@/lib/supabase'

export default async function CardsPage() {
  const { data: cards } = await supabase
    .from('credit_cards')
    .select('*')
    .order('balance', { ascending: false })

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">Tarjetas</h1>

      <div className="space-y-4">
        {cards?.map((card) => (
          <div key={card.id} className="border rounded p-4">
            <h2 className="text-xl font-semibold">{card.name}</h2>
            <p>Banco: {card.bank}</p>
            <p>Balance: ${Number(card.balance || 0).toLocaleString()}</p>
            <p>Pago mínimo: ${Number(card.minimum_payment || 0).toLocaleString()}</p>
            <p>Día de pago: {card.due_day || 'N/A'}</p>
          </div>
        ))}
      </div>
    </main>
  )
}
