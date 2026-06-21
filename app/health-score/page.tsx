import { requireUser } from '@/lib/auth/requireUser'
import Nav from '../components/Nav'

export default async function HealthScorePage() {
  const { supabase } = await requireUser()
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_active', true)

  const { data: cards } = await supabase
    .from('credit_cards')
    .select('*')
    .eq('is_active', true)

  const { data: priorities } = await supabase
    .from('priorities')
    .select('*')

  const { data: future } = await supabase
    .from('future_obligations')
    .select('*')

  const cash =
    accounts
      ?.filter((a) => a.is_spendable)
      .reduce((sum, a) => sum + Number(a.balance || 0), 0) || 0

  const debt =
    cards?.reduce(
      (sum, c) => sum + Number(c.balance || 0),
      0
    ) || 0

  const openPriorities =
    priorities?.filter((p) => p.status !== 'done').length || 0

  const futureReserve =
    future?.reduce(
      (sum, f) => sum + Number(f.monthly_reserve || 0),
      0
    ) || 0

  const liquidityScore =
    cash > 2000 ? 25 :
    cash > 1000 ? 20 :
    cash > 500 ? 15 :
    cash > 250 ? 10 :
    5

  const debtScore =
    debt < 1000 ? 25 :
    debt < 3000 ? 20 :
    debt < 5000 ? 15 :
    debt < 8000 ? 10 :
    5

  const priorityScore =
    Math.max(25 - (openPriorities * 2), 5)

  const reserveScore =
    futureReserve > 200 ? 25 :
    futureReserve > 100 ? 20 :
    futureReserve > 50 ? 15 :
    10

  const total =
    liquidityScore +
    debtScore +
    priorityScore +
    reserveScore

  const strengths = []

  if (cash > 500) {
    strengths.push('Hay liquidez básica disponible.')
  }

  if (futureReserve >= 200) {
    strengths.push('Ya tienes identificadas reservas futuras importantes.')
  }

  if (debt < 5000) {
    strengths.push('La deuda total todavía está en un rango manejable.')
  }

  const risks = []

  if (cash < 1000) {
    risks.push('Liquidez baja: hay poco margen para emergencias.')
  }

  if (debt > 3000) {
    risks.push('Uso elevado de tarjetas o deuda pendiente.')
  }

  if (openPriorities > 5) {
    risks.push('Hay muchas prioridades abiertas al mismo tiempo.')
  }

  if (futureReserve > 0) {
    risks.push('Las reservas están planificadas, pero todavía no necesariamente acumuladas.')
  }

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">
        🏥 Financial Health Score
      </h1>

      <Nav />

      <div className="border rounded p-6">
        <h2 className="text-2xl font-bold">
          Score Total
        </h2>

        <p className="text-6xl font-bold">
          {total}/100
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <h3>Liquidez</h3>
          <p>{liquidityScore}/25</p>
        </div>

        <div className="border rounded p-4">
          <h3>Deuda</h3>
          <p>{debtScore}/25</p>
        </div>

        <div className="border rounded p-4">
          <h3>Prioridades</h3>
          <p>{priorityScore}/25</p>
        </div>

        <div className="border rounded p-4">
          <h3>Reservas</h3>
          <p>{reserveScore}/25</p>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-4">
          <h2 className="text-xl font-bold mb-3">
            📈 Qué ayuda tu score
          </h2>

          <ul className="space-y-2">
            {strengths.map((item) => (
              <li key={item}>🟢 {item}</li>
            ))}
          </ul>
        </div>

        <div className="border rounded p-4">
          <h2 className="text-xl font-bold mb-3">
            📉 Qué afecta tu score
          </h2>

          <ul className="space-y-2">
            {risks.map((item) => (
              <li key={item}>🔴 {item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-xl font-bold mb-3">
          🎯 Cómo subir tu score
        </h2>

        <ol className="space-y-2">
          <li>1. Resolver marbete y prioridades críticas.</li>
          <li>2. Llevar efectivo disponible sobre $1,000.</li>
          <li>3. Reducir balances de tarjetas.</li>
          <li>4. Acumular reservas reales para gastos futuros.</li>
        </ol>
      </section>
    </main>
  )
}