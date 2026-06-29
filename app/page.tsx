import { requireUser } from '@/lib/auth/requireUser'
import {
  getDashboardSummary,
  getLedgerSummary,
  getPortfolioSummary,
} from '@/lib/financial-engine'
import Nav from './components/Nav'

export const dynamic = 'force-dynamic'

function money(value: unknown) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

type RecentMovement = {
  id: string
  description: string
  amount: number
  owner: string
}

export default async function Home() {
  const { supabase, user } = await requireUser()

  const [
    dashboardSummary,
    portfolioSummary,
    ledgerSummary,
  ] = await Promise.all([
    getDashboardSummary(supabase, user.id),
    getPortfolioSummary(supabase, user.id),
    getLedgerSummary(supabase, user.id),
  ])

  const { liquidity, planning } = dashboardSummary
  // Dashboard recent movements use confirmed ledger only. Import candidates are
  // excluded until promoted.
  const entryRows: RecentMovement[] = ledgerSummary.confirmedLedgerEntries
    .slice(0, 5)
    .map((entry) => ({
      id: entry.id,
      description: entry.description || 'Movimiento registrado',
      amount: Number(entry.amount || 0),
      owner:
        typeof entry.metadata.owner === 'string' && entry.metadata.owner
          ? entry.metadata.owner
          : 'N/A',
    }))
  const hasPendingImportReview =
    ledgerSummary.importReviewCandidates.length > 0 ||
    ledgerSummary.athReviewCandidates.length > 0
  const cardRows = liquidity.creditCards
  const planningRows = planning.planningItems
  const plaidCashByInstitution = liquidity.plaidCashByInstitution
  const plaidCreditAvailableByInstitution =
    liquidity.plaidCreditAvailableByInstitution
  const plaidCreditDebtByInstitution = liquidity.plaidCreditDebtByInstitution
  const manualCash = liquidity.manualCash
  const cashAvailableTotal = portfolioSummary.totalLiquidAvailable
  const pendingPayments = liquidity.pendingPayments
  const totalPendingPayments = liquidity.totalPendingPayments
  const confirmedIncome = liquidity.confirmedIncome
  const totalConfirmedIncome = liquidity.totalConfirmedIncome
  const resultToday = liquidity.resultToday
  const resultAfterIncome = liquidity.resultAfterIncome
  const connectedCreditDebt = portfolioSummary.totalCreditDebt
  const connectedCreditAvailable = portfolioSummary.totalCreditAvailable
  const manualCardDebt = liquidity.manualCardDebt
  const manualMinimumPayments = liquidity.manualMinimumPayments
  const totalFutureObligations = planning.totalFutureObligations

  return (
    <main className="p-8 space-y-8">
      <h1 className="text-4xl font-bold">Mansor One</h1>

      <Nav />

      {hasPendingImportReview && (
        <section className="border rounded p-4">
          Hay transacciones pendientes de revisión que todavía no aparecen en
          los movimientos recientes.
        </section>
      )}

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
