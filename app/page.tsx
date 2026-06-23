import { requireUser } from '@/lib/auth/requireUser'
import { getFinancialDecisionContext } from '@/lib/pablo/getFinancialDecisionContext'
import Nav from './components/Nav'
export const dynamic = 'force-dynamic'

export default async function Home() {
  const { supabase } = await requireUser()

  // central decision context: avoid duplicating financial calculations
  const decisionCtx = await getFinancialDecisionContext(supabase)

  const { data: plaidAccounts, error: plaidAccountsError } = await supabase
    .from('plaid_accounts')
    .select('name, available_balance, current_balance, type, institution_name, connection_id')

  const { data: entries } = await supabase
    .from('quick_entries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: plaidEntries } = await supabase
    .from('quick_entries')
    .select('*')
    .eq('source', 'plaid')

  const plaidDepository = plaidAccounts?.filter((a) => a.type === 'depository') || []

  const plaidCredit = plaidAccounts?.filter((a) => a.type === 'credit') || []

  // Values provided by decision context (avoid recalculating)
  const availableTodayBanks = decisionCtx.cashAvailable
  const realBalanceBanks = decisionCtx.currentBankBalances
  const creditAvailable = decisionCtx.creditAvailable
  const creditDebt = decisionCtx.connectedCreditDebt

  const bankTotals = plaidDepository.reduce((acc, account) => {
    const institution = account.institution_name || 'Unknown'
    acc[institution] = (acc[institution] || 0) + Number(account.available_balance || 0)
    return acc
  }, {} as Record<string, number>)

  const creditTotals = plaidCredit.reduce((acc, account) => {
    const institution = account.institution_name || 'Unknown'
    acc[institution] = (acc[institution] || 0) + Number(account.available_balance || 0)
    return acc
  }, {} as Record<string, number>)



  // Use context-provided pending payments, totals, critical liabilities and projections
  const totalDebt = decisionCtx.totalCreditCardDebt
  const pendingPayments = decisionCtx.pendingPaymentInstances
  const totalPending = decisionCtx.totalPendingPayments
  const totalUpcomingIncome = decisionCtx.upcomingIncome

  const criticalLiabilities = decisionCtx.unpaidCriticalLiabilities || []

  const projectedAvailableWithIncome = decisionCtx.projectedCashAfterIncome
  const projectedAvailable = decisionCtx.cashAvailable - decisionCtx.totalPendingPayments

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
          <h2 className="font-semibold">💰 Dinero disponible en bancos</h2>
          <p className="text-3xl font-bold">
            ${availableTodayBanks.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">🏦 Balance real en bancos</h2>
          <p className="text-3xl font-bold">
            ${realBalanceBanks.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">💳 Crédito disponible en tarjetas</h2>
          <p className="text-3xl font-bold">
            ${creditAvailable.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">💳 Deuda actual en tarjetas conectadas</h2>
          <p className="text-3xl font-bold">
            ${creditDebt.toLocaleString()}
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
      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-3">Instituciones conectadas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded p-4">
            <h3 className="font-semibold">Dinero en bancos</h3>
            <div className="space-y-2">
              {Object.entries(bankTotals).map(([institution, amount]) => (
                <p key={institution}>
                  {institution}: ${amount.toLocaleString()}
                </p>
              ))}
            </div>
          </div>
          <div className="border rounded p-4">
            <h3 className="font-semibold">Crédito disponible</h3>
            <div className="space-y-2">
              {Object.entries(creditTotals).map(([institution, amount]) => (
                <p key={institution}>
                  {institution}: ${amount.toLocaleString()}
                </p>
              ))}
            </div>
          </div>
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
        ${availableTodayBanks.toLocaleString()}
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

 {(() => {
    const criticalWithoutPayment = criticalLiabilities.filter((l: any) => l.status === 'due_today' || l.status === 'in_grace' || l.status === 'overdue')
    const totalCriticalMonthly = criticalWithoutPayment.reduce((sum, l: any) => sum + Number(l.monthly_payment || 0), 0)
    const hasCriticalUncovered = criticalWithoutPayment.length > 0 && availableTodayBanks < totalCriticalMonthly

    if (hasCriticalUncovered) {
      const criticalName = criticalWithoutPayment[0]?.name || 'Compromiso crítico'
      return (
        <p className="text-orange-600 font-semibold">
          ⚠️ Atención: el efectivo disponible hoy no cubre compromisos críticos como {criticalName}. Evita pagos extra y no uses crédito como efectivo. Prioriza promesa de pago o espera próximo ingreso si aún estás dentro de gracia.
        </p>
      )
    }

    if (projectedAvailableWithIncome < 0) {
      return (
        <p className="text-red-600 font-semibold">
          ⚠️ Alerta: aun incluyendo los próximos ingresos, faltaría dinero para cubrir los pagos pendientes.
        </p>
      )
    }

    return (
      <p className="text-green-600 font-semibold">
        ✅ Vas bien: incluyendo los próximos ingresos, los pagos pendientes quedan cubiertos.
      </p>
    )
  })()}
</section>
      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-2">🤖 Recomendación</h2>
        <p>{decisionCtx.recommendationSummary}</p>
      </section>

      {criticalLiabilities.length > 0 && (
        <section className="border rounded p-4">
          <h2 className="text-2xl font-bold mb-2">🚨 Compromisos críticos</h2>
          <div className="space-y-3">
            {criticalLiabilities.map((l: any) => (
              <div key={l.id} className="border rounded p-3">
                <div className="flex items-center justify-between">
                  <strong>{l.name}</strong>
                  <span className="text-sm opacity-70">{l.status === 'due_today' ? 'Vence hoy' : l.status === 'in_grace' ? 'En gracia' : l.status === 'overdue' ? 'Vencida' : 'Próxima'}</span>
                </div>
                <p>Monto mensual: ${Number(l.monthly_payment || 0).toLocaleString()}</p>
                <p>Vence día: {l.due_day || 'N/A'}</p>
                {l.grace_day && <p>Fecha límite / gracia: día {l.grace_day}</p>}
                {l.notes && <p className="text-sm opacity-70">{l.notes}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-2xl font-bold mb-4">
          📌 Pagos pendientes / promesas
        </h2>

        <div className="space-y-3">
          {pendingPayments.map((payment: any) => (
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