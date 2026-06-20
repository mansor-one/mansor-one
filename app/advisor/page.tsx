'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString()}`
}

export default function AdvisorPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [cards, setCards] = useState<any[]>([])
  const [income, setIncome] = useState<any[]>([])
  const [goals, setGoals] = useState<any[]>([])
  const [maintenance, setMaintenance] = useState<any[]>([])
  const [liabilities, setLiabilities] = useState<any[]>([])
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')

  async function loadData() {
  const month = 6
  const year = 2026

  const { data: accountsData } = await supabase
    .from('plaid_accounts')
    .select('*')

  const { data: paymentsData, error: paymentsError } = await supabase
    .from('payment_instances')
    .select('*')
    .eq('payment_month', month)
    .eq('payment_year', year)

  const { data: cardsData, error: cardsError } = await supabase
    .from('credit_cards')
    .select('*')
    .eq('is_active', true)

  const { data: incomeData, error: incomeError } = await supabase
    .from('income_schedule')
    .select('*')
    .eq('is_active', true)

  const { data: goalsData } = await supabase
    .from('financial_goals')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true })

  const { data: maintenanceData } = await supabase
    .from('asset_maintenance')
    .select('*')
    .eq('is_active', true)
    .neq('status', 'done')
    .order('priority', { ascending: true })

  const { data: liabilitiesData } = await supabase
    .from('liabilities')
    .select('*')
    .eq('is_active', true)
    .order('balance', { ascending: false })

  console.log('paymentsError', paymentsError)
  console.log('cardsError', cardsError)
  console.log('incomeError', incomeError)

  setAccounts(accountsData || [])
  setPayments(paymentsData || [])
  setCards(cardsData || [])
  setIncome(incomeData || [])
  setGoals(goalsData || [])
  setMaintenance(maintenanceData || [])
  setLiabilities(liabilitiesData || [])
}

  useEffect(() => {
    loadData()
  }, [])

  const spendableCash = accounts.reduce(
    (sum, account) =>
      sum + Number(account.available_balance ?? account.current_balance ?? 0),
    0
  )

  const pendingPayments = payments.filter((payment) => payment.status !== 'paid')

  const totalPendingPayments = pendingPayments.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0
  )

  const upcomingIncome = income
    .filter((item) => item.amount && item.next_expected_date)
    .sort((a, b) => a.next_expected_date.localeCompare(b.next_expected_date))

  const totalUpcomingIncome = upcomingIncome.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  )

  const projectedCash = spendableCash + totalUpcomingIncome - totalPendingPayments

  const totalDebt = cards.reduce(
    (sum, card) => sum + Number(card.balance || 0),
    0
  )

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

  const activeGoals = goals.map((goal) => {
    const target = Number(goal.target_amount || 0)
    const current = Number(goal.current_amount || 0)
    const remaining = Math.max(target - current, 0)

    return { ...goal, target, current, remaining }
  })

  const urgentGoals = activeGoals
    .filter((goal) => goal.remaining > 0)
    .sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99))
    .slice(0, 3)

  function analyzeQuestion() {
    const lower = question.toLowerCase()
    const amountMatch = lower.match(/(\d+(\.\d+)?)/)
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
        `❌ No lo recomiendo ahora. Si usas ${formatMoney(
          requestedAmount
        )}, quedarías corto por ${formatMoney(
          Math.abs(projectedAfterDecision)
        )} considerando ingresos y pagos pendientes.`
      )
      return
    }

    setAnswer(
      `✅ Se puede evaluar. Después de usar ${formatMoney(
        requestedAmount
      )}, quedarías con aproximadamente ${formatMoney(
        projectedAfterDecision
      )} considerando ingresos y pagos pendientes.`
    )
  }

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">🤖 Mansor Advisor</h1>

      <Nav />

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">💰 Disponible Hoy</h2>
          <p className="text-3xl font-bold">{formatMoney(spendableCash)}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">💵 Próximos Ingresos</h2>
          <p className="text-3xl font-bold">{formatMoney(totalUpcomingIncome)}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">📅 Pagos Pendientes</h2>
          <p className="text-3xl font-bold">{formatMoney(totalPendingPayments)}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">📊 Cash Proyectado</h2>
          <p className="text-3xl font-bold">{formatMoney(projectedCash)}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">💳 Deuda Tarjetas</h2>
          <p className="text-3xl font-bold">{formatMoney(totalDebt)}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">🏦 Deudas Grandes</h2>
          <p className="text-3xl font-bold">{formatMoney(totalLiabilities)}</p>
          <p className="text-sm opacity-70">
            Pagos mensuales: {formatMoney(totalMonthlyDebtPayments)}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">🛠️ Mantenimiento</h2>
          <p className="text-3xl font-bold">{formatMoney(totalMaintenance)}</p>
        </div>
      </section>

      <section className="border rounded p-4 space-y-4">
        <h2 className="text-2xl font-bold">Pregúntale a Pablo</h2>

        <textarea
          className="border rounded p-3 w-full min-h-28"
          placeholder="Ejemplo: ¿Puedo pagar $500 extra a Popular?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        <button className="border rounded p-3" onClick={analyzeQuestion}>
          Analizar decisión
        </button>

        {answer && (
          <div className="border rounded p-4">
            <h3 className="font-bold mb-2">Respuesta</h3>
            <p>{answer}</p>
          </div>
        )}
      </section>

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-4">🏦 Liabilities / Deudas</h2>

        <div className="space-y-3">
          {liabilities.map((item) => (
            <div key={item.id} className="border rounded p-4">
              <strong>{item.name}</strong>
              <p>Tipo: {item.liability_type}</p>
              <p>Banco/Entidad: {item.lender}</p>
              <p>Dueño: {item.owner}</p>
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
              <p>Asset ID: {item.asset_id}</p>
              <p>Costo estimado: {formatMoney(Number(item.estimated_cost || 0))}</p>
              {item.due_date && <p>Fecha objetivo: {item.due_date}</p>}
              {item.due_mileage && <p>Millaje objetivo: {item.due_mileage}</p>}
              <p>Prioridad: {item.priority}</p>
              <p>Estado: {item.status}</p>
              {item.notes && <p className="text-sm opacity-70">{item.notes}</p>}
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