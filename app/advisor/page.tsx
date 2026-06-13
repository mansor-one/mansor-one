'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default function AdvisorPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [cards, setCards] = useState<any[]>([])
  const [income, setIncome] = useState<any[]>([])
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

    setAccounts(accountsData || [])
    setPayments(paymentsData || [])
    setCards(cardsData || [])
    setIncome(incomeData || [])
  }

  useEffect(() => {
    loadData()
  }, [])

  const today = new Date()
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

    if (beforePaycheckAfterDecision < 0) {
      setAnswer(
        `⚠️ Antes del próximo cheque quedarías corto por $${Math.abs(
          beforePaycheckAfterDecision
        ).toLocaleString()}. Aunque algunos pagos son el día 18, primero confirma que el ingreso entra antes de pagar.`
      )
      return
    }

    if (afterPaycheckAfterDecision < 0) {
      setAnswer(
        `❌ No lo recomiendo. Después de considerar el próximo ingreso y pagos pendientes, quedarías corto por $${Math.abs(
          afterPaycheckAfterDecision
        ).toLocaleString()}.`
      )
      return
    }

    if (afterPaycheckAfterDecision < 150) {
      setAnswer(
        `⚠️ Se puede, pero quedarías con solo $${afterPaycheckAfterDecision.toLocaleString()} después del próximo ingreso y pagos. Mejor usar menos o esperar.`
      )
      return
    }

    if (
      lower.includes('cuarto') ||
      lower.includes('nena') ||
      lower.includes('gaby') ||
      lower.includes('andrea')
    ) {
      setAnswer(
        `✅ Se puede considerar. Usar $${requestedAmount.toLocaleString()} para los cuartos dejaría aproximadamente $${afterPaycheckAfterDecision.toLocaleString()} después del próximo ingreso y pagos pendientes.`
      )
      return
    }

    if (
      lower.includes('popular') ||
      lower.includes('visa') ||
      lower.includes('tarjeta')
    ) {
      setAnswer(
        `✅ Tiene sentido atacar deuda, especialmente Popular Visa. Si pagas $${requestedAmount.toLocaleString()}, quedarías con aproximadamente $${afterPaycheckAfterDecision.toLocaleString()} después del próximo ingreso y pagos.`
      )
      return
    }

    setAnswer(
      `✅ Se puede evaluar. Después de usar $${requestedAmount.toLocaleString()}, quedarías con aproximadamente $${afterPaycheckAfterDecision.toLocaleString()} considerando el próximo ingreso y pagos pendientes.`
    )
  }

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">🤖 Mansor Advisor</h1>

      <Nav />

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">💰 Disponible Hoy</h2>
          <p className="text-3xl font-bold">${spendableCash.toLocaleString()}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">⚠️ Antes del próximo cheque</h2>
          <p className="text-3xl font-bold">${cashBeforePaycheck.toLocaleString()}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">📊 Después del cheque y pagos</h2>
          <p className="text-3xl font-bold">${cashAfterPaycheckAndPayments.toLocaleString()}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">💳 Deuda Tarjetas</h2>
          <p className="text-3xl font-bold">${totalDebt.toLocaleString()}</p>
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
        <h2 className="text-2xl font-bold mb-4">📌 Pagos antes del próximo cheque</h2>

        <div className="space-y-3">
          {paymentsBeforeNextPay.map((payment) => (
            <div key={payment.id} className="border rounded p-4">
              <strong>{payment.name}</strong>
              <p>${Number(payment.amount || 0).toLocaleString()}</p>
              <p>Estado: {payment.status}</p>
              <p>Fecha efectiva: {payment.effective_due_date}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-4">📅 Pagos del día del cheque o después</h2>

        <div className="space-y-3">
          {paymentsOnOrAfterNextPay.map((payment) => (
            <div key={payment.id} className="border rounded p-4">
              <strong>{payment.name}</strong>
              <p>${Number(payment.amount || 0).toLocaleString()}</p>
              <p>Estado: {payment.status}</p>
              <p>Fecha efectiva: {payment.effective_due_date}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}