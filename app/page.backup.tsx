import { requireUser } from '@/lib/auth/requireUser'
import { getFinancialDecisionContext } from '@/lib/pablo/getFinancialDecisionContext'
import Nav from './components/Nav'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const { supabase } = await requireUser()

  const decisionCtx = await getFinancialDecisionContext(supabase)

  const { data: plaidAccounts, error: plaidAccountsError } = await supabase
  .from('plaid_accounts')
  .select('name, available_balance, current_balance, type, institution_name, connection_id')

const { data: manualAccounts } = await supabase
  .from('accounts')
  .select('name, balance, account_type, is_spendable, is_active')
  .eq('is_active', true)

const { data: incomeSchedule } = await supabase
  .from('income_schedule')
  .select('name, owner, amount, next_expected_date, frequency, is_active')
  .eq('is_active', true)

  const { data: entries } = await supabase
    .from('quick_entries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: plaidEntries } = await supabase
    .from('quick_entries')
    .select('*')
    .eq('source', 'plaid')

  const plaidDepository =
    plaidAccounts?.filter((a) => a.type === 'depository') || []

  const plaidCredit =
    plaidAccounts?.filter((a) => a.type === 'credit') || []

  const availableTodayBanks = decisionCtx.cashAvailable
  const realBalanceBanks = decisionCtx.currentBankBalances
  const creditAvailable = decisionCtx.creditAvailable
  const creditDebt = decisionCtx.connectedCreditDebt

  const bankTotals = plaidDepository.reduce((acc, account) => {
    const institution = account.institution_name || 'Unknown'
    acc[institution] =
      (acc[institution] || 0) + Number(account.available_balance || 0)
    return acc
  }, {} as Record<string, number>)

  const bankCurrentTotals = plaidDepository.reduce((acc, account) => {
  const institution = account.institution_name || 'Unknown'
  acc[institution] =
    (acc[institution] || 0) + Number(account.current_balance || 0)
  return acc
}, {} as Record<string, number>)

const spendableManualAccounts =
  manualAccounts?.filter((account: any) => account.is_spendable) || []

const manualSpendableTotal = spendableManualAccounts.reduce(
  (sum: number, account: any) => sum + Number(account.balance || 0),
  0
)

const totalSpendableCash = availableTodayBanks + manualSpendableTotal

  const creditDebtTotals = plaidCredit.reduce((acc, account) => {
   const name =
  account.institution_name ||
  account.name ||
  'Tarjeta'
    acc[name] = (acc[name] || 0) + Number(account.current_balance || 0)
    return acc
  }, {} as Record<string, number>)

  const totalPending = decisionCtx.totalPendingPayments
  const pendingPayments = decisionCtx.pendingPaymentInstances || []
  const totalUpcomingIncome = decisionCtx.upcomingIncome
  const upcomingIncomeItems =
  incomeSchedule?.filter((item: any) => item.amount && item.next_expected_date) || []

const upcomingIncomeTotal = upcomingIncomeItems.reduce(
  (sum: number, item: any) => sum + Number(item.amount || 0),
  0
)
  const criticalLiabilities = decisionCtx.unpaidCriticalLiabilities || []

  const projectedAvailableWithIncome = decisionCtx.projectedCashAfterIncome
  const projectedAvailable =
  totalSpendableCash - decisionCtx.totalPendingPayments

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

          <div className="mt-3 text-sm space-y-1">
            {Object.entries(bankTotals).map(([institution, amount]) => (
              <p key={institution}>
                {institution}: ${Number(amount).toLocaleString()}
              </p>
            ))}
          </div>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">🏦 Balance real en bancos</h2>
          <p className="text-3xl font-bold">
            ${realBalanceBanks.toLocaleString()}
          </p>

          <div className="mt-3 text-sm space-y-1">
            {Object.entries(bankCurrentTotals).map(([institution, amount]) => (
              <p key={institution}>
                {institution}: ${Number(amount).toLocaleString()}
              </p>
            ))}
          </div>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">💳 Crédito disponible en tarjetas</h2>
          <p className="text-3xl font-bold">
            ${creditAvailable.toLocaleString()}
          </p>

          <div className="mt-3 text-sm space-y-1">
         {plaidCredit.map((card: any) => (
  <p key={card.name}>
    {card.institution_name}: $
    {Number(card.available_balance || 0).toLocaleString()}
  </p>
))}
          </div>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">💳 Deuda tarjetas conectadas</h2>
          <p className="text-3xl font-bold">
            ${creditDebt.toLocaleString()}
          </p>

          <div className="mt-3 text-sm space-y-1">
            {Object.entries(creditDebtTotals).map(([card, amount]) => (
              <p key={card}>
                {card}: ${Number(amount).toLocaleString()}
              </p>
            ))}
          </div>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">📅 Pagos pendientes del mes</h2>
          <p className="text-3xl font-bold">
            ${totalPending.toLocaleString()}
          </p>

          <div className="mt-3 text-sm space-y-1">
            {pendingPayments.map((payment: any) => (
              <p key={payment.id}>
                {payment.name}: $
                {Number(payment.amount || 0).toLocaleString()} -{' '}
                {payment.effective_due_date}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">⚠️ Dinero faltante / sobrante antes del próximo ingreso</h2>
          <p className="text-3xl font-bold">
            ${projectedAvailable.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">📊 Gasto real del mes</h2>
          <p className="text-3xl font-bold">
            ${realMonthlySpending.toLocaleString()}
          </p>
        </div>
      </section>

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
              ${totalSpendableCash.toLocaleString()}
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
                <strong>{l.name}</strong>
                <p>
                  Monto mensual: $
                  {Number(l.monthly_payment || 0).toLocaleString()}
                </p>
                <p>Vence día: {l.due_day || 'N/A'}</p>
                {l.grace_day && (
                  <p>Fecha límite / gracia: día {l.grace_day}</p>
                )}
                {l.notes && (
                  <p className="text-sm opacity-70">{l.notes}</p>
                )}
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