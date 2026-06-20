import { requireUser } from '@/lib/auth/requireUser'
import Nav from './components/Nav'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const { supabase } = await requireUser()
  const { data: plaidAccounts, error: plaidAccountsError } = await supabase
    .from('plaid_accounts')
    .select('name, available_balance, current_balance')

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

  const { data: plaidEntries } = await supabase
    .from('quick_entries')
    .select('*')
    .eq('source', 'plaid')

    const { data: upcomingIncome } = await supabase
  .from('income_schedule')
  .select('*')
  .eq('is_active', true)
  .not('amount', 'is', null)
  .not('next_expected_date', 'is', null)
  .gte('next_expected_date', '2026-06-01')
  .lte('next_expected_date', '2026-06-30')
  .order('next_expected_date', { ascending: true })

  const availableTodayPlaid =
    plaidAccounts?.reduce(
      (sum, account) => sum + Number(account.available_balance || 0),
      0
    ) || 0

  const realBalancePlaid =
    plaidAccounts?.reduce(
      (sum, account) => sum + Number(account.current_balance || 0),
      0
    ) || 0

  const totalDebt =
    cards?.reduce((sum, card) => sum + Number(card.balance || 0), 0) || 0

  const pendingPayments =
    payments?.filter((payment) => payment.status !== 'paid') || []

  const totalPending = pendingPayments.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0
  )
const totalUpcomingIncome =
  upcomingIncome?.reduce(
    (sum, income) => sum + Number(income.amount || 0),
    0
  ) || 0

const projectedAvailableWithIncome =
  availableTodayPlaid + totalUpcomingIncome - totalPending
  const projectedAvailable = availableTodayPlaid - totalPending

  const realMonthlySpending =
    plaidEntries
      ?.filter(
        (entry) =>
          Number(entry.amount) > 0 &&
          entry.category !== 'Transferencia Recibida'
      )
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0) || 0

  return (
    <main className="p-8 space-y-8">
      <h1 className="text-4xl font-bold">Mansor One</h1>

      <Nav />

      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">💰 Disponible Hoy Plaid</h2>
          <p className="text-3xl font-bold">
            ${availableTodayPlaid.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">🏦 Balance Real Plaid</h2>
          <p className="text-3xl font-bold">
            ${realBalancePlaid.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">📅 Pagos pendientes del mes</h2>
          <p className="text-3xl font-bold">
            ${totalPending.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">⚠️ Proyección sin incluir próximo ingreso</h2>
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

      <div className="border rounded p-4">
        <h2 className="font-semibold">📊 Gasto real del mes</h2>
        <p className="text-3xl font-bold">
          ${realMonthlySpending.toLocaleString()}
        </p>
      </div>
<section className="border rounded p-4 space-y-3">
  <h2 className="text-2xl font-bold">💵 Cash Flow Real</h2>
  <div>
  <p className="font-semibold">Próximos ingresos</p>
  <p className="text-2xl font-bold">
    ${totalUpcomingIncome.toLocaleString()}
  </p>
</div>

<div>
  <p className="font-semibold">Disponible proyectado con ingresos</p>
  <p className="text-2xl font-bold">
    ${projectedAvailableWithIncome.toLocaleString()}
  </p>
</div>

  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div>
      <p className="font-semibold">Disponible hoy</p>
      <p className="text-2xl font-bold">
        ${availableTodayPlaid.toLocaleString()}
      </p>
    </div>

    <div>
      <p className="font-semibold">Pagos pendientes</p>
      <p className="text-2xl font-bold">
        ${totalPending.toLocaleString()}
      </p>
    </div>

    <div>
      <p className="font-semibold">Disponible proyectado</p>
      <p className="text-2xl font-bold">
        ${projectedAvailable.toLocaleString()}
      </p>
    </div>
  </div>

 {projectedAvailableWithIncome < 0 ? (
  <p className="text-red-600 font-semibold">
    ⚠️ Alerta: aun incluyendo los próximos ingresos, faltaría dinero para cubrir los pagos pendientes.
  </p>
) : (
  <p className="text-green-600 font-semibold">
    ✅ Vas bien: incluyendo los próximos ingresos, los pagos pendientes quedan cubiertos.
  </p>
)}
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

      {plaidAccountsError && (
        <pre className="text-red-500">
          Error Plaid Accounts: {plaidAccountsError.message}
        </pre>
      )}
    </main>
  )
}