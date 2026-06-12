'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default function AdvisorPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [cards, setCards] = useState<any[]>([])
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

    setAccounts(accountsData || [])
    setPayments(paymentsData || [])
    setCards(cardsData || [])
  }

  useEffect(() => {
    loadData()
  }, [])

  const spendableCash =
    accounts
      .filter((account) => account.is_spendable)
      .reduce((sum, account) => sum + Number(account.balance || 0), 0)

  const pendingPayments =
    payments.filter((payment) => payment.status !== 'paid')

  const pendingTotal =
    pendingPayments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    )

  const projectedCash = spendableCash - pendingTotal

  const totalDebt =
    cards.reduce((sum, card) => sum + Number(card.balance || 0), 0)

  function analyzeQuestion() {
    const lower = question.toLowerCase()

    const amountMatch = lower.match(/(\d+(\.\d+)?)/)
    const requestedAmount = amountMatch ? Number(amountMatch[0]) : 0

    if (!question.trim()) {
      setAnswer('Escribe una pregunta o decisión para analizar.')
      return
    }

    if (requestedAmount === 0) {
      setAnswer(
        'Entiendo la idea, pero necesito un monto para poder evaluar el impacto en el cash flow.'
      )
      return
    }

    const remainingAfterDecision = projectedCash - requestedAmount

    if (projectedCash < 0) {
      setAnswer(
        `⚠️ Ahora mismo el disponible proyectado está negativo en $${Math.abs(
          projectedCash
        ).toLocaleString()}. No recomiendo usar dinero en esa decisión hasta cubrir los pagos pendientes.`
      )
      return
    }

    if (remainingAfterDecision < 0) {
      setAnswer(
        `❌ No lo recomiendo ahora. Si usas $${requestedAmount.toLocaleString()}, quedarías corto por $${Math.abs(
          remainingAfterDecision
        ).toLocaleString()} después de los pagos pendientes.`
      )
      return
    }

    if (remainingAfterDecision < 100) {
      setAnswer(
        `⚠️ Se podría, pero quedarías con solo $${remainingAfterDecision.toLocaleString()} después de pagos pendientes. Recomiendo bajar el monto o esperar al próximo ingreso.`
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
        `✅ Se puede considerar. Si usas $${requestedAmount.toLocaleString()}, quedarías con $${remainingAfterDecision.toLocaleString()} después de pagos pendientes. Recomendación: si no es urgente, usar una parte ahora y guardar otra para Popular Visa.`
      )
      return
    }

    if (
      lower.includes('popular') ||
      lower.includes('visa') ||
      lower.includes('tarjeta')
    ) {
      setAnswer(
        `✅ Tiene sentido priorizar deuda, especialmente Popular Visa. Si pagas $${requestedAmount.toLocaleString()}, aún quedarías con $${remainingAfterDecision.toLocaleString()} después de pagos pendientes.`
      )
      return
    }

    setAnswer(
      `✅ Se puede evaluar. Si usas $${requestedAmount.toLocaleString()}, quedarías con $${remainingAfterDecision.toLocaleString()} después de pagos pendientes. Antes de hacerlo, valida si hay algún pago no registrado.`
    )
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

      <section className="border rounded p-4 space-y-4">
        <h2 className="text-2xl font-bold">Pregúntale a Pablo</h2>

        <textarea
          className="border rounded p-3 w-full min-h-28"
          placeholder="Ejemplo: Quiero usar $200 para los cuartos de las nenas"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        <button
          className="border rounded p-3"
          onClick={analyzeQuestion}
        >
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
          📌 Pagos considerados
        </h2>

        <div className="space-y-3">
          {pendingPayments.map((payment) => (
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