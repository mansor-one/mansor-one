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
  const [priorities, setPriorities] = useState<any[]>([])
  const [futureObligations, setFutureObligations] = useState<any[]>([])
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')

  async function loadData() {
    const { data: accountsData } = await supabase
      .from('accounts')
      .select('*')
      .eq('is_active', true)

    const { data: paymentsData } = await supabase
      .from('payment_instances')
      .select('*')
      .eq('payment_month', 6)
      .eq('payment_year', 2026)

    const { data: cardsData } = await supabase
      .from('credit_cards')
      .select('*')
      .eq('is_active', true)

    const { data: incomeData } = await supabase
      .from('income_schedule')
      .select('*')
      .eq('is_active', true)

    const { data: prioritiesData } = await supabase
      .from('priorities')
      .select('*')
      .neq('status', 'paid')

    const { data: futureData } = await supabase
      .from('future_obligations')
      .select('*')
      .neq('status', 'done')

    setAccounts(accountsData || [])
    setPayments(paymentsData || [])
    setCards(cardsData || [])
    setIncome(incomeData || [])
    setPriorities(prioritiesData || [])
    setFutureObligations(futureData || [])
  }

  useEffect(() => {
    loadData()
  }, [])

  const nextPayDate = new Date('2026-06-18')

  const spendableCash = accounts
    .filter((account) => account.is_spendable)
    .reduce((sum, account) => sum + Number(account.balance || 0), 0)

  const pendingPayments = payments.filter((payment) => payment.status !== 'paid')

  const paymentsBeforeNextPay = pendingPayments.filter((payment) => {
    const dueDate = new Date(payment.effective_due_date)
    return dueDate < nextPayDate
  })

  const paymentsOnOrAfterNextPay = pendingPayments.filter((payment) => {
    const dueDate = new Date(payment.effective_due_date)
    return dueDate >= nextPayDate
  })

  const dueBeforeNextPay = paymentsBeforeNextPay.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0
  )

  const dueOnOrAfterNextPay = paymentsOnOrAfterNextPay.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0
  )

  const knownIncomeBeforeOrOnNextPay = income
    .filter((item) => {
      if (!item.next_expected_date) return false
      const incomeDate = new Date(item.next_expected_date)
      return incomeDate <= nextPayDate
    })
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const cashBeforePaycheck = spendableCash - dueBeforeNextPay

  const cashAfterPaycheckAndPayments =
    spendableCash +
    knownIncomeBeforeOrOnNextPay -
    dueBeforeNextPay -
    dueOnOrAfterNextPay

  const totalDebt = cards.reduce(
    (sum, card) => sum + Number(card.balance || 0),
    0
  )

  const criticalPriorities = priorities.filter(
    (item) => item.priority_level === 'critical'
  )

  const highPriorities = priorities.filter(
    (item) => item.priority_level === 'high'
  )

  const nextFutureObligations = futureObligations
    .filter((item) => item.target_date)
    .sort((a, b) => a.target_date.localeCompare(b.target_date))
    .slice(0, 3)

  const totalFutureObligations = futureObligations.reduce(
    (sum, item) => sum + Number(item.estimated_amount || 0),
    0
  )

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

    const beforePaycheckAfterDecision = cashBeforePaycheck - requestedAmount
    const afterPaycheckAfterDecision =
      cashAfterPaycheckAndPayments - requestedAmount

    const hasCriticalOpen = criticalPriorities.length > 0
    const hasMarbete = priorities.some((p) =>
      p.name?.toLowerCase().includes('marbete')
    )
    const hasAutoExpreso = priorities.some((p) =>
      p.name?.toLowerCase().includes('autoexpreso')
    )

    if (
      lower.includes('cuarto') ||
      lower.includes('nena') ||
      lower.includes('gaby') ||
      lower.includes('andrea')
    ) {
      if (hasCriticalOpen || hasMarbete) {
        setAnswer(
          `⚠️ No lo pondría como prioridad ahora. Antes de usar ${formatMoney(
            requestedAmount
          )} en los cuartos, resolvería prioridades críticas como hipoteca, seguro, US Bank y marbete. Después del próximo cheque quedarías con ${formatMoney(
            afterPaycheckAfterDecision
          )}, pero todavía hay obligaciones importantes abiertas.`
        )
        return
      }
    }

    if (beforePaycheckAfterDecision < 0) {
      setAnswer(
        `⚠️ Antes del próximo cheque quedarías corto por ${formatMoney(
          Math.abs(beforePaycheckAfterDecision)
        )}. No recomiendo usar ese dinero ahora salvo que sea para una prioridad crítica.`
      )
      return
    }

    if (afterPaycheckAfterDecision < 0) {
      setAnswer(
        `❌ No lo recomiendo. Después de considerar el próximo ingreso y pagos pendientes, quedarías corto por ${formatMoney(
          Math.abs(afterPaycheckAfterDecision)
        )}.`
      )
      return
    }

    if (afterPaycheckAfterDecision < 150) {
      setAnswer(
        `⚠️ Se puede, pero quedarías con solo ${formatMoney(
          afterPaycheckAfterDecision
        )} después del próximo ingreso y pagos. Mejor usar menos o esperar.`
      )
      return
    }

    if (
      lower.includes('popular') ||
      lower.includes('visa') ||
      lower.includes('tarjeta')
    ) {
      setAnswer(
        `✅ Tiene sentido atacar deuda, especialmente deuda cara como Popular Visa. Si pagas ${formatMoney(
          requestedAmount
        )}, quedarías con aproximadamente ${formatMoney(
          afterPaycheckAfterDecision
        )} después del próximo ingreso y pagos. Antes de hacerlo, confirma que marbete, hipoteca, seguro y US Bank estén cubiertos.`
      )
      return
    }

    if (hasAutoExpreso) {
      setAnswer(
        `✅ Se puede evaluar, pero recuerda que AutoExpreso sigue como obligación alta. Si usas ${formatMoney(
          requestedAmount
        )}, quedarías con aproximadamente ${formatMoney(
          afterPaycheckAfterDecision
        )}. Yo separaría algo para AutoExpreso o marbete antes de gastos discrecionales.`
      )
      return
    }

    setAnswer(
      `✅ Se puede evaluar. Después de usar ${formatMoney(
        requestedAmount
      )}, quedarías con aproximadamente ${formatMoney(
        afterPaycheckAfterDecision
      )} considerando el próximo ingreso y pagos pendientes.`
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
          <h2 className="font-semibold">⚠️ Antes del próximo cheque</h2>
          <p className="text-3xl font-bold">{formatMoney(cashBeforePaycheck)}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">📊 Después del cheque y pagos</h2>
          <p className="text-3xl font-bold">
            {formatMoney(cashAfterPaycheckAndPayments)}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">💳 Deuda Tarjetas</h2>
          <p className="text-3xl font-bold">{formatMoney(totalDebt)}</p>
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-4">🚨 Riesgos y prioridades</h2>

        <div className="space-y-3">
          {criticalPriorities.map((item) => (
            <div key={item.id} className="border rounded p-3">
              <strong>🔴 {item.name}</strong>
              <p>{formatMoney(Number(item.amount || 0))}</p>
              <p>Status: {item.status}</p>
            </div>
          ))}

          {highPriorities.map((item) => (
            <div key={item.id} className="border rounded p-3">
              <strong>🟠 {item.name}</strong>
              <p>{formatMoney(Number(item.amount || 0))}</p>
              <p>Status: {item.status}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-4">🔮 Próximas obligaciones</h2>

        <p className="mb-3">
          Total futuro identificado: {formatMoney(totalFutureObligations)}
        </p>

        <div className="space-y-3">
          {nextFutureObligations.map((item) => (
            <div key={item.id} className="border rounded p-3">
              <strong>{item.name}</strong>
              <p>Estimado: {formatMoney(Number(item.estimated_amount || 0))}</p>
              <p>Fecha objetivo: {item.target_date}</p>
              <p>Prioridad: {item.priority}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border rounded p-4 space-y-4">
        <h2 className="text-2xl font-bold">Pregúntale a Pablo</h2>

        <textarea
          className="border rounded p-3 w-full min-h-28"
          placeholder="Ejemplo: Quiero usar $200 para los cuartos de las nenas"
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
        <h2 className="text-2xl font-bold mb-4">
          📌 Pagos antes del próximo cheque
        </h2>

        <div className="space-y-3">
          {paymentsBeforeNextPay.map((payment) => (
            <div key={payment.id} className="border rounded p-4">
              <strong>{payment.name}</strong>
              <p>{formatMoney(Number(payment.amount || 0))}</p>
              <p>Estado: {payment.status}</p>
              <p>Fecha efectiva: {payment.effective_due_date}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-4">
          📅 Pagos del día del cheque o después
        </h2>

        <div className="space-y-3">
          {paymentsOnOrAfterNextPay.map((payment) => (
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