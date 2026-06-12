import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default async function AdvisorPage() {
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_active', true)

  const { data: payments } = await supabase
    .from('payment_instances')
    .select('*')
    .eq('payment_month', 6)
    .eq('payment_year', 2026)

  const { data: cards } = await supabase
    .from('credit_cards')
    .select('*')
    .eq('is_active', true)

  const spendableCash =
    accounts
      ?.filter((account) => account.is_spendable)
      .reduce((sum, account) => sum + Number(account.balance || 0), 0) || 0

  const pendingPayments =
    payments?.filter((payment) => payment.status !== 'paid') || []

  const pendingTotal =
    pendingPayments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    )

  const projectedCash = spendableCash - pendingTotal

  const totalDebt =
    cards?.reduce((sum, card) => sum + Number(card.balance || 0), 0) || 0

  let recommendation = ''

  if (projectedCash < 0) {
    recommendation =
      '⚠️ No se recomienda asignar dinero a metas o compras. Primero debemos cubrir los pagos pendientes y validar los próximos ingresos.'
  } else if (pendingTotal > 0) {
    recommendation =
      '📅 Hay pagos pendientes este mes. Prioridad: cubrir Internet, Hipoteca, SunRun y cualquier promesa de pago antes de realizar gastos discrecionales.'
  } else {
    recommendation =
      '✅ No hay pagos pendientes registrados. Puedes evaluar acelerar Popular Visa, crear fondo de emergencia o separar dinero para proyectos.'
  }

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">🤖 Mansor Advisor</h1>

      <Nav />

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">💰 Disponible Hoy</h2>
          <p className="text-3xl font-bold">
            ${spendableCash.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">📅 Pagos Pendientes</h2>
          <p className="text-3xl font-bold">
            ${pendingTotal.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">📊 Disponible Proyectado</h2>
          <p className="text-3xl font-bold">
            ${projectedCash.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">💳 Deuda Tarjetas</h2>
          <p className="text-3xl font-bold">
            ${totalDebt.toLocaleString()}
          </p>
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-2">
          🤖 Recomendación Actual
        </h2>

        <p>{recommendation}</p>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-4">
          📌 Pagos considerados
        </h2>

        <div className="space-y-3">
          {pendingPayments.map((payment) => (
            <div key={payment.id} className="border rounded p-4">
              <strong>{payment.name}</strong>

              <p>
                ${Number(payment.amount || 0).toLocaleString()}
              </p>

              <p>
                Estado: {payment.status}
              </p>

              <p>
                Fecha efectiva: {payment.effective_due_date}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
