import { requireUser } from '@/lib/auth/requireUser'
import Nav from './components/Nav'

export const dynamic = 'force-dynamic'

function money(value: unknown) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

type PlaidAccount = {
  id?: string
  plaid_account_id?: string
  institution_name?: string | null
  available_balance?: number | null
  current_balance?: number | null
  type?: string | null
}

type ManualAccount = {
  id?: string
  name?: string | null
  balance?: number | null
  is_spendable?: boolean | null
}

type PaymentInstance = {
  id: string
  name?: string | null
  amount?: number | null
  status?: string | null
  effective_due_date?: string | null
}

type IncomeSchedule = {
  id?: string
  name?: string | null
  amount?: number | null
  next_expected_date?: string | null
}

type CreditCard = {
  id: string
  name?: string | null
  balance?: number | null
  minimum_payment?: number | null
  due_day?: number | null
}

type PlanningItem = {
  id: string
  name?: string | null
  target_amount?: number | null
  due_date?: string | null
}

type QuickEntry = {
  id: string
  description?: string | null
  amount?: number | null
  owner?: string | null
}

function institutionBalances(
  accounts: PlaidAccount[],
  getBalance: (account: PlaidAccount) => number
) {
  const totals = accounts.reduce((acc, account) => {
    const institution = account.institution_name || 'Institución desconocida'
    acc[institution] = (acc[institution] || 0) + getBalance(account)
    return acc
  }, {} as Record<string, number>)

  return Object.entries(totals).map(([institution, balance]) => ({
    institution,
    balance,
  }))
}

function cashBalance(account: PlaidAccount) {
  return Number(account.available_balance ?? account.current_balance ?? 0)
}

export default async function Home() {
  const { supabase, user } = await requireUser()

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const { data: plaidAccounts } = await supabase
    .from('plaid_accounts')
    .select('*')
    .eq('user_id', user.id)

  const { data: manualAccounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const { data: incomeSchedule } = await supabase
    .from('income_schedule')
    .select('*')
    .eq('is_active', true)

  const { data: payments } = await supabase
    .from('payment_instances')
    .select('*')
    .eq('payment_month', month)
    .eq('payment_year', year)

  const { data: cards } = await supabase
    .from('credit_cards')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('balance', { ascending: false })

  const { data: planningItems } = await supabase
    .from('planning_items')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .eq('is_completed', false)
    .order('due_date', { ascending: true })
    .limit(5)

  const { data: entries } = await supabase
    .from('quick_entries')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const plaidAccountRows = (plaidAccounts || []) as PlaidAccount[]
  const manualAccountRows = (manualAccounts || []) as ManualAccount[]
  const paymentRows = (payments || []) as PaymentInstance[]
  const incomeRows = (incomeSchedule || []) as IncomeSchedule[]
  const cardRows = (cards || []) as CreditCard[]
  const planningRows = (planningItems || []) as PlanningItem[]
  const entryRows = (entries || []) as QuickEntry[]

  const plaidCash = plaidAccountRows.filter((account) =>
    ['depository', 'cash'].includes(account.type || '')
  )

  const plaidCredit = plaidAccountRows.filter(
    (account) => account.type === 'credit'
  )

  const plaidCashByInstitution = institutionBalances(plaidCash, cashBalance)

  const plaidCreditAvailableByInstitution = institutionBalances(
    plaidCredit,
    (account) => Number(account.available_balance ?? 0)
  )

  const plaidCreditDebtByInstitution = institutionBalances(
    plaidCredit,
    (account) => Number(account.current_balance ?? 0)
  )

  const manualCash = manualAccountRows.filter(
    (account) =>
      account.is_spendable &&
      !['FirstBank', 'Popular'].includes(account.name || '')
  )

  const cashAvailablePlaid = plaidCash.reduce(
    (sum: number, a: PlaidAccount) => sum + cashBalance(a),
    0
  )

  const cashAvailableManual = manualCash.reduce(
    (sum: number, account) => sum + Number(account.balance || 0),
    0
  )

  const cashAvailableTotal = cashAvailablePlaid + cashAvailableManual

  const pendingPayments = paymentRows.filter(
    (payment) => payment.status !== 'paid'
  )

  const totalPendingPayments = pendingPayments.reduce(
    (sum: number, payment) => sum + Number(payment.amount || 0),
    0
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const confirmedIncome = incomeRows
    .filter((income) => {
      if (!income.amount || !income.next_expected_date) return false

      const incomeDate = new Date(`${income.next_expected_date}T00:00:00`)
      return incomeDate >= today
    })
    .sort(
      (a, b) =>
        new Date(`${a.next_expected_date}T00:00:00`).getTime() -
        new Date(`${b.next_expected_date}T00:00:00`).getTime()
    )

  const totalConfirmedIncome = confirmedIncome.reduce(
    (sum: number, income) => sum + Number(income.amount || 0),
    0
  )

  const resultToday = cashAvailableTotal - totalPendingPayments
  const resultAfterIncome =
    cashAvailableTotal + totalConfirmedIncome - totalPendingPayments

  const connectedCreditDebt = plaidCredit.reduce(
    (sum: number, c: PlaidAccount) => sum + Number(c.current_balance || 0),
    0
  )

  const connectedCreditAvailable = plaidCredit.reduce(
    (sum: number, c: PlaidAccount) => sum + Number(c.available_balance || 0),
    0
  )

  const manualCardDebt =
    cardRows.reduce(
      (sum: number, card) => sum + Number(card.balance || 0),
      0
    ) || 0

  const manualMinimumPayments =
    cardRows.reduce(
      (sum: number, card) => sum + Number(card.minimum_payment || 0),
      0
    ) || 0

  const totalFutureObligations =
    planningRows.reduce(
      (sum: number, item) => sum + Number(item.target_amount || 0),
      0
    ) || 0

  return (
    <main className="p-8 space-y-8">
      <h1 className="text-4xl font-bold">Mansor One</h1>

      <Nav />

      <section className="border rounded p-4 space-y-4">
        <h2 className="text-2xl font-bold">💰 Panorama de liquidez</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="border rounded p-4">
            <h3 className="font-semibold">Disponible hoy</h3>
            <p className="text-3xl font-bold">${money(cashAvailableTotal)}</p>

            <div className="mt-3 text-sm space-y-1">
              {plaidCashByInstitution.map((item) => (
                <p key={item.institution}>
                  {item.institution}: ${money(item.balance)}
                </p>
              ))}

              {manualCash.map((account) => (
                <p key={account.id || account.name}>
                  {account.name}: ${money(account.balance)}
                </p>
              ))}
            </div>
          </div>

          <div className="border rounded p-4">
            <h3 className="font-semibold">Pagos pendientes</h3>
            <p className="text-3xl font-bold">${money(totalPendingPayments)}</p>

            <div className="mt-3 text-sm space-y-1">
              {pendingPayments.map((payment) => (
                <p key={payment.id}>
                  {payment.effective_due_date} · {payment.name}: $
                  {money(payment.amount)}
                </p>
              ))}
            </div>
          </div>

          <div className="border rounded p-4">
            <h3 className="font-semibold">Próximos ingresos</h3>
            <p className="text-3xl font-bold">${money(totalConfirmedIncome)}</p>

            <div className="mt-3 text-sm space-y-1">
              {confirmedIncome.map((income) => (
                <p key={income.id || income.name}>
                  {income.next_expected_date} · {income.name}: $
                  {money(income.amount)}
                </p>
              ))}
            </div>
          </div>

          <div className="border rounded p-4">
            <h3 className="font-semibold">Resultado</h3>

            <p className="text-sm">Antes de ingresos</p>
            <p className="text-2xl font-bold">${money(resultToday)}</p>

            <p className="text-sm mt-3">Con próximos ingresos</p>
            <p className="text-2xl font-bold">${money(resultAfterIncome)}</p>
          </div>
        </div>
      </section>

      <section className="border rounded p-4 space-y-4">
        <h2 className="text-2xl font-bold">💳 Deuda y crédito</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="border rounded p-4">
            <h3 className="font-semibold">Crédito disponible conectado</h3>
            <p className="text-3xl font-bold">
              ${money(connectedCreditAvailable)}
            </p>

            <div className="mt-3 text-sm space-y-1">
              {plaidCreditAvailableByInstitution.map((item) => (
                <p key={item.institution}>
                  {item.institution}: ${money(item.balance)}
                </p>
              ))}
            </div>
          </div>

          <div className="border rounded p-4">
            <h3 className="font-semibold">Deuda tarjetas conectadas</h3>
            <p className="text-3xl font-bold">${money(connectedCreditDebt)}</p>

            <div className="mt-3 text-sm space-y-1">
              {plaidCreditDebtByInstitution.map((item) => (
                <p key={item.institution}>
                  {item.institution}: ${money(item.balance)}
                </p>
              ))}
            </div>
          </div>

          <div className="border rounded p-4">
            <h3 className="font-semibold">Tarjetas manuales</h3>
            <p className="text-3xl font-bold">${money(manualCardDebt)}</p>

            <div className="mt-3 text-sm space-y-1">
              {cardRows.map((card) => (
                <p key={card.id}>
                  {card.name}: ${money(card.balance)}
                </p>
              ))}
            </div>
          </div>

          <div className="border rounded p-4">
            <h3 className="font-semibold">Pagos mínimos tarjetas</h3>
            <p className="text-3xl font-bold">${money(manualMinimumPayments)}</p>

            <div className="mt-3 text-sm space-y-1">
              {cardRows.map((card) => (
                <p key={card.id}>
                  Día {card.due_day || 'N/A'} · {card.name}: $
                  {money(card.minimum_payment)}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border rounded p-4 space-y-4">
        <h2 className="text-2xl font-bold">🔮 Futuro cercano</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded p-4">
            <h3 className="font-semibold">Planning próximos</h3>

            <p className="text-3xl font-bold">
              ${money(totalFutureObligations)}
            </p>

            <div className="mt-3 text-sm space-y-1">
              {planningRows.map((item) => (
                <p key={item.id}>
                  {item.due_date || 'Sin fecha'} · {item.name}: $
                  {money(item.target_amount)}
                </p>
              ))}
            </div>
          </div>

          <div className="border rounded p-4">
            <h3 className="font-semibold">Últimos movimientos</h3>

            <div className="mt-3 text-sm space-y-1">
              {entryRows.map((entry) => (
                <p key={entry.id}>
                  {entry.description}: ${money(entry.amount)} · {entry.owner}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
