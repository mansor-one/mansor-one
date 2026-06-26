import { requireUser } from '@/lib/auth/requireUser'
import { getLiquiditySummary } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'
import Nav from '../components/Nav'

type CardRow = {
  id?: string
  name?: string | null
  bank?: string | null
  balance?: number | null
  minimum_payment?: number | null
  due_day?: number | null
  apr?: number | string | null
}

export default async function CardsPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  let cards: CardRow[] = []
  let totalDebt = 0
  let totalMinimum = 0
  let error: { message: string } | null = null

  try {
    const liquidity = await getLiquiditySummary(supabase, user.id)
    cards = liquidity.creditCards as CardRow[]
    totalDebt = liquidity.manualCardDebt
    totalMinimum = liquidity.manualMinimumPayments
  } catch (caughtError) {
    error = {
      message:
        caughtError instanceof Error
          ? caughtError.message
          : 'No se pudieron cargar las tarjetas.',
    }
  }

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">💳 Tarjetas</h1>

      <Nav />

      {error && <div className="border rounded p-4">{error.message}</div>}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Deuda total</h2>
          <p className="text-3xl font-bold">${totalDebt.toLocaleString()}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Pagos mínimos</h2>
          <p className="text-3xl font-bold">${totalMinimum.toLocaleString()}</p>
        </div>
      </section>

      <div className="space-y-4">
        {cards?.map((card) => (
          <div key={card.id} className="border rounded p-4">
            <h2 className="text-xl font-semibold">{card.name}</h2>
            <p>Banco: {card.bank || 'N/A'}</p>
            <p>Balance: ${Number(card.balance || 0).toLocaleString()}</p>
            <p>Pago mínimo: ${Number(card.minimum_payment || 0).toLocaleString()}</p>
            <p>Día de pago: {card.due_day || 'N/A'}</p>
            <p>APR: {card.apr ? `${card.apr}%` : 'N/A'}</p>
          </div>
        ))}
      </div>
    </main>
  )
}
