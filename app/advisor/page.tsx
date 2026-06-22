'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getFinancialDecisionContext, FinancialDecisionContext } from '@/lib/pablo/getFinancialDecisionContext'
import Nav from '../components/Nav'

function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString()}`
}

function statusLabel(status: string) {
  if (status === 'in_grace') return 'En gracia'
  if (status === 'due_today') return 'Vence hoy'
  if (status === 'due_soon') return 'Próximo'
  if (status === 'overdue') return 'Vencido'
  return status.replace('_', ' ')
}

export default function AdvisorPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [cards, setCards] = useState<any[]>([])
  const [income, setIncome] = useState<any[]>([])
  const [goals, setGoals] = useState<any[]>([])
  const [maintenance, setMaintenance] = useState<any[]>([])
  const [liabilities, setLiabilities] = useState<any[]>([])
  const [assets, setAssets] = useState<any[]>([])
  const [financialContext, setFinancialContext] = useState<FinancialDecisionContext | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')

  async function loadData() {
    const month = 6
    const year = 2026

    const { data: assetsData } = await supabase.from('assets').select('*').eq('is_active', true)
    const { data: accountsData } = await supabase.from('plaid_accounts').select('*')
    const { data: paymentsData } = await supabase.from('payment_instances').select('*').eq('payment_month', month).eq('payment_year', year)
    const { data: cardsData } = await supabase.from('credit_cards').select('*').eq('is_active', true)
    const { data: incomeData } = await supabase.from('income_schedule').select('*').eq('is_active', true)
    const { data: goalsData } = await supabase.from('financial_goals').select('*').eq('is_active', true).order('priority', { ascending: true })
    const { data: maintenanceData } = await supabase.from('asset_maintenance').select('*').eq('is_active', true).neq('status', 'done').order('priority', { ascending: true })
    const { data: liabilitiesData } = await supabase.from('liabilities').select('*').eq('is_active', true).order('balance', { ascending: false })

    setAssets(assetsData || [])
    setAccounts(accountsData || [])
    setPayments(paymentsData || [])
    setCards(cardsData || [])
    setIncome(incomeData || [])
    setGoals(goalsData || [])
    setMaintenance(maintenanceData || [])
    setLiabilities(liabilitiesData || [])

    const context = await getFinancialDecisionContext(supabase)
    setFinancialContext(context)
  }

  useEffect(() => {
    loadData()
  }, [])

  const spendableCash = financialContext?.cashAvailable ?? 0

  const creditAvailable = financialContext?.creditAvailable ?? 0

  const creditDebt = financialContext?.connectedCreditDebt ?? 0

  const bankTotals = accounts
    .filter((a) => a.type === 'depository')
    .reduce((acc, account) => {
      const institution = account.institution_name || 'Unknown'
      acc[institution] = (acc[institution] || 0) + Number(account.available_balance ?? account.current_balance ?? 0)
      return acc
    }, {} as Record<string, number>)

  const creditTotals = accounts
    .filter((a) => a.type === 'credit')
    .reduce((acc, account) => {
      const institution = account.institution_name || 'Unknown'
      acc[institution] = (acc[institution] || 0) + Number(account.available_balance ?? 0)
      return acc
    }, {} as Record<string, number>)

  const bankTotalsEntries = Object.entries(bankTotals) as [string, number][]
  const creditTotalsEntries = Object.entries(creditTotals) as [string, number][]

  const pendingPayments = financialContext?.pendingPaymentInstances ?? []

  const totalPendingPayments = financialContext?.totalPendingPayments ?? 0

  const totalUpcomingIncome = financialContext?.upcomingIncome ?? 0

  const projectedCash = spendableCash + totalUpcomingIncome - totalPendingPayments

  const totalDebt = cards.reduce((sum, card) => sum + Number(card.balance || 0), 0)

  const totalMaintenance = maintenance.reduce(
    (sum, item) => sum + Number(item.estimated_cost || 0),
    0
  )

  const totalLiabilities = liabilities.reduce(
    (sum, item) => sum + Number(item.balance || 0),
    0
  )

  const totalMonthlyDebtPayments = liabilities.reduce(
    (sum, item) => sum + Number(item.monthly_payment || 0),
    0
  )

  const totalAssets = assets.reduce(
    (sum, item) => sum + Number(item.estimated_value || 0),
    0
  )

  const netWorth = totalAssets - totalLiabilities - totalDebt

  const activeGoals = goals.map((goal) => {
    const target = Number(goal.target_amount || 0)
    const current = Number(goal.current_amount || 0)
    const remaining = Math.max(target - current, 0)
    return { ...goal, target, current, remaining }
  })

  const emergencyFundTarget = 2000
  const emergencyGoal = activeGoals.find((g) => g.name === 'Fondo Emergencia')

  const emergencyFundScore = Math.min(
    ((Number(emergencyGoal?.current || 0) / emergencyFundTarget) * 20),
    20
  )

  const liquidityScore =
    spendableCash >= 2000 ? 20 : Math.round((spendableCash / 2000) * 20)

  const debtScore =
    totalDebt < 10000 ? 20 : totalDebt < 25000 ? 15 : totalDebt < 50000 ? 10 : 5

  const assetScore = totalAssets >= 250000 ? 20 : totalAssets >= 100000 ? 15 : 10

  const cashFlowScore =
    projectedCash > 3000 ? 20 : projectedCash > 1000 ? 15 : projectedCash > 0 ? 10 : 0

  const healthScore = Math.round(
    emergencyFundScore + liquidityScore + debtScore + assetScore + cashFlowScore
  )

  const urgentGoals = activeGoals
    .filter((goal) => goal.remaining > 0)
    .sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99))
    .slice(0, 3)

  // attention items include unpaid critical liabilities and pending payment instances
  const criticalLiabilities = financialContext?.attentionItems ?? []

  const alertLiabilities = criticalLiabilities.filter((liability: any) =>
    ['due_today', 'in_grace', 'overdue', 'due_soon'].includes(liability.status)
  )

  const showCriticalAlert = alertLiabilities.length > 0
  const showRecommendationSummary =
    financialContext?.recommendationLevel === 'warning' ||
    financialContext?.recommendationLevel === 'critical'

  function analyzeQuestion() {
    const amountMatch = question.toLowerCase().match(/(\d+(\.\d+)?)/)
    const requestedAmount = amountMatch ? Number(amountMatch[0]) : 0

    if (!question.trim()) {
      setAnswer('Escribe una decisión para analizar.')
      return
    }

    if (requestedAmount === 0) {
      setAnswer('Necesito un monto para evaluar el impacto.')
      return
    }

    const projectedAfterDecision = projectedCash - requestedAmount

    if (projectedAfterDecision < 0) {
      setAnswer(
        `❌ No lo recomiendo ahora. Si usas ${formatMoney(requestedAmount)}, quedarías corto por ${formatMoney(Math.abs(projectedAfterDecision))}.`
      )
      return
    }

    setAnswer(
      `✅ Se puede evaluar. Después de usar ${formatMoney(requestedAmount)}, quedarías con aproximadamente ${formatMoney(projectedAfterDecision)}.`
    )
  }

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">🤖 Mansor Advisor</h1>
      <Nav />

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4"><h2 className="font-semibold">💰 Disponible Hoy</h2><p className="text-3xl font-bold">{formatMoney(spendableCash)}</p></div>
        <div className="border rounded p-4"><h2 className="font-semibold">💵 Próximos Ingresos</h2><p className="text-3xl font-bold">{formatMoney(totalUpcomingIncome)}</p></div>
        <div className="border rounded p-4"><h2 className="font-semibold">📅 Pagos Pendientes</h2><p className="text-3xl font-bold">{formatMoney(totalPendingPayments)}</p></div>
        <div className="border rounded p-4"><h2 className="font-semibold">📊 Cash Proyectado</h2><p className="text-3xl font-bold">{formatMoney(projectedCash)}</p></div>
        <div className="border rounded p-4"><h2 className="font-semibold">💳 Deuda Tarjetas</h2><p className="text-3xl font-bold">{formatMoney(totalDebt)}</p></div>
        <div className="border rounded p-4"><h2 className="font-semibold">💳 Crédito disponible (tarjetas)</h2><p className="text-3xl font-bold">{formatMoney(creditAvailable)}</p></div>
        <div className="border rounded p-4"><h2 className="font-semibold">🏦 Instituciones conectadas</h2><div className="space-y-1">{bankTotalsEntries.map(([name, amount]) => (<p key={name}>{name}: {formatMoney(amount)}</p>))}</div></div>
        <div className="border rounded p-4"><h2 className="font-semibold">🏦 Crédito por institución</h2><div className="space-y-1">{creditTotalsEntries.map(([name, amount]) => (<p key={name}>{name}: {formatMoney(amount)}</p>))}</div></div>
        <div className="border rounded p-4"><h2 className="font-semibold">🏦 Deudas Grandes</h2><p className="text-3xl font-bold">{formatMoney(totalLiabilities)}</p><p className="text-sm opacity-70">Pagos mensuales: {formatMoney(totalMonthlyDebtPayments)}</p></div>
        <div className="border rounded p-4"><h2 className="font-semibold">🛠️ Mantenimiento</h2><p className="text-3xl font-bold">{formatMoney(totalMaintenance)}</p></div>
        <div className="border rounded p-4"><h2 className="font-semibold">🏦 Net Worth</h2><p className="text-3xl font-bold">{formatMoney(netWorth)}</p><p className="text-sm opacity-70">Assets: {formatMoney(totalAssets)}</p></div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">🏥 Financial Health</h2>
          <p className="text-3xl font-bold">{healthScore}/100</p>
          <p className="text-sm">Liquidity: {liquidityScore}/20</p>
          <p className="text-sm">Emergency Fund: {Math.round(emergencyFundScore)}/20</p>
          <p className="text-sm">Debt Load: {debtScore}/20</p>
          <p className="text-sm">Asset Strength: {assetScore}/20</p>
          <p className="text-sm">Cash Flow: {cashFlowScore}/20</p>
        </div>
      </section>

      

      <section className="border rounded p-4 space-y-4">
        <h2 className="text-2xl font-bold">Pregúntale a Pablo</h2>
        <textarea className="border rounded p-3 w-full min-h-28" placeholder="Ejemplo: ¿Puedo pagar $500 extra a Popular?" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <button className="border rounded p-3" onClick={analyzeQuestion}>Analizar decisión</button>
        {answer && <div className="border rounded p-4"><h3 className="font-bold mb-2">Respuesta</h3><p>{answer}</p></div>}
      </section>

      {showCriticalAlert && financialContext && (
        <section className="border rounded p-4">
          <h2 className="text-2xl font-bold mb-2">🚨 Atención crítica</h2>
          {showRecommendationSummary && (
            <p className="font-semibold">{financialContext.recommendationSummary}</p>
          )}
          <div className="mt-3 space-y-2">
            {alertLiabilities.map((liability: any) => (
              <div key={liability.id} className="rounded border p-3">
                <p className="font-semibold">{liability.name}</p>
                <p>
                  {formatMoney(Number(liability.amount || 0))} — {statusLabel(liability.status)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-4">🏦 Liabilities / Deudas</h2>
        <div className="space-y-3">
          {liabilities.map((item) => (
            <div key={item.id} className="border rounded p-4">
              <strong>{item.name}</strong>
              <p>Balance: {formatMoney(Number(item.balance || 0))}</p>
              <p>APR: {item.apr}%</p>
              <p>Pago mensual: {formatMoney(Number(item.monthly_payment || 0))}</p>
              <p>Vence día: {item.due_day}</p>
              {item.grace_day && <p>Fecha límite: día {item.grace_day}</p>}
              {item.remaining_payments && <p>Pagos restantes: {item.remaining_payments}</p>}
              {item.notes && <p className="text-sm opacity-70">{item.notes}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-4">🎯 Metas activas</h2>
        <div className="space-y-3">
          {urgentGoals.map((goal) => (
            <div key={goal.id} className="border rounded p-4">
              <strong>{goal.name}</strong>
              <p>Meta: {formatMoney(goal.target)}</p>
              <p>Ahorrado: {formatMoney(goal.current)}</p>
              <p>Faltante: {formatMoney(goal.remaining)}</p>
              <p>Fecha objetivo: {goal.target_date}</p>
              <p>Prioridad: {goal.priority}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-4">🛠️ Mantenimiento de Assets</h2>
        <div className="space-y-3">
          {maintenance.map((item) => (
            <div key={item.id} className="border rounded p-4">
              <strong>{item.name}</strong>
              <p>
                Asset:{' '}
                {item.asset_id === 'e3081886-a459-476e-8097-ec420651f46b'
                  ? 'Honda'
                  : item.asset_id === 'ede26719-17f7-4f6f-ab55-6d6b2984d75a'
                  ? 'Toyota Corolla Cross'
                  : 'Sin asset asociado'}
              </p>
              <p>Costo estimado: {formatMoney(Number(item.estimated_cost || 0))}</p>
              {item.due_date && <p>Fecha objetivo: {item.due_date}</p>}
              {item.due_mileage && <p>Millaje objetivo: {item.due_mileage}</p>}
              <p>Estado: {item.status}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-4">📌 Pagos pendientes</h2>
        <div className="space-y-3">
          {pendingPayments.map((payment) => (
            <div key={payment.id} className="border rounded p-4">
              <strong>{payment.name}</strong>
              <p>{formatMoney(Number(payment.amount || 0))}</p>
              <p>Estado: {payment.status}</p>
              <p>Fecha efectiva: {payment.effective_due_date}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}