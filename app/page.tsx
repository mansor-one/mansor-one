import { supabase } from '@/lib/supabase'
import Nav from './components/Nav'

export default async function Home() {
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_active', true)

  const { data: cards } = await supabase
    .from('credit_cards')
    .select('*')
    .eq('is_active', true)

  const { data: payments } = await supabase
    .from('payment_instances')
    .select('*')
    .eq('payment_month', 6)
    .eq('payment_year', 2026)
    .order('effective_due_date', { ascending: true })

  const { data: entries } = await supabase
    .from('quick_entries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  const spendableCash =
    accounts
      ?.filter((account) => account.is_spendable)
      .reduce((sum, account) => sum + Number(account.balance || 0), 0) || 0

  const totalDebt =
    cards?.reduce((sum, card) => sum + Number(card.balance || 0), 0) || 0

  const pendingPayments =
    payments?.filter((payment) => payment.status !== 'paid') || []

  const totalPending =
    pendingPayments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    )

  const projectedAvailable = spendableCash - totalPending

  return (
    <main className="p-8 space-y-8">
      <h1 className="text-4xl font-bold">Mansor One</h1>

      <Nav />

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">💰 Disponible Hoy</h2>
          <p className="text-3xl font-bold">
            ${spendableCash.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">📅 Pagos pendientes del mes</h2>
          <p className="text-3xl font-bold">
            ${totalPending.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">✅ Disponible después de pagos</h2>
          <p className="text-3xl font-bold">
            ${projectedAvailable.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">💳 Deuda total en tarjetas</h2>
          <p className="text-3xl font-bold">
            ${totalDebt.toLocaleString()}
          </p>
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-2">🤖 Recomendación</h2>
        <p>
          Prioridad actual: cubrir pagos pendientes/promesas del mes y atacar
          Popular Visa antes de acelerar US Bank.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4">
          📌 Pagos pendientes / promesas
        </h2>

        <div className="space-y-3">
          {pendingPayments.map((payment) => (
            <div key={payment.id} className="border rounded p-4">
              <strong>{payment.name}</strong>
              <p>${Number(payment.amount || 0).toLocaleString()}</p>
              <p>Fecha efectiva: {payment.effective_due_date}</p>
              <p>Estado: {payment.status}</p>
              {payment.notes && (
                <p className="text-sm opacity-70">{payment.notes}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4">📜 Últimos movimientos</h2>

        <div className="space-y-3">
          {entries?.map((entry) => (
            <div key={entry.id} className="border rounded p-4">
              <strong>{entry.description}</strong>
              <p>
                {entry.entry_type} - ${Number(entry.amount).toLocaleString()} -{' '}
                {entry.owner}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}