'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default function PaymentInstancesPage() {
  const [payments, setPayments] = useState<any[]>([])
  const [liabilities, setLiabilities] = useState<any[]>([])
  const [message, setMessage] = useState('')

  async function loadPayments() {
    const { data, error } = await supabase
      .from('payment_instances')
      .select('*')
      .eq('payment_month', 6)
      .eq('payment_year', 2026)
      .order('effective_due_date', { ascending: true })

    if (error) {
      setMessage(error.message)
      return
    }

    setPayments(data || [])
    // load liabilities for this month to show large debts if not represented in payment_instances
    const { data: liabilitiesData } = await supabase
      .from('liabilities')
      .select('*')
      .eq('is_active', true)

    setLiabilities(liabilitiesData || [])
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase
      .from('payment_instances')
      .update({ status })
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Actualizado ✅')
    loadPayments()
  }

  useEffect(() => {
    loadPayments()
  }, [])

  const totalPending = payments
    .filter((p) => p.status !== 'paid')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0)

  const totalPaid = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0)

  // helper for flexible name matching
  const hasMatchingPayment = (liabilityName: string, isPaid: boolean = false) => {
    return payments.some((p: any) => {
      if (isPaid && p.status !== 'paid') return false
      if (!isPaid && p.status === 'paid') return false
      const pName = String(p.name || '').toLowerCase().trim()
      const lName = String(liabilityName || '').toLowerCase().trim()
      return pName.includes(lName.split(' ')[0]) || lName.includes(pName.split(' ')[0])
    })
  }

  const liabilitiesDueNotInPayments = liabilities.filter((l) => {
    if (!l.monthly_payment) return false
    // exclude if already has a paid payment_instance with flexible matching
    return !hasMatchingPayment(l.name, true)
  })

  // compute suggested state for liabilities not in payments
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const msPerDay = 1000 * 60 * 60 * 24

  const liabilitiesWithSuggested = liabilitiesDueNotInPayments.map((l) => {
    const dueDay = l.due_day ? Number(l.due_day) : null
    const graceDay = l.grace_day ? Number(l.grace_day) : null
    let suggested = 'normal'
    let status = 'normal'

    if (dueDay) {
      const dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay)
      const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / msPerDay)
      if (daysUntil === 0) { status = 'due_today'; suggested = 'attention' }
      else if (daysUntil < 0) {
        if (graceDay) {
          const graceDate = new Date(now.getFullYear(), now.getMonth(), graceDay)
          if (today.getTime() <= graceDate.getTime()) { status = 'in_grace'; suggested = 'attention' }
          else { status = 'overdue'; suggested = 'overdue' }
        } else { status = 'overdue'; suggested = 'overdue' }
      } else if (daysUntil > 0 && daysUntil <= 7) { status = 'due_soon'; suggested = 'soon' }
    }

    return { ...l, status, suggested }
  })

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">📌 Pagos del Mes</h1>
      <Nav />

      {message && <p>{message}</p>}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Pendiente / Promesa</h2>
          <p className="text-3xl font-bold">${totalPending.toLocaleString()}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Pagado</h2>
          <p className="text-3xl font-bold">${totalPaid.toLocaleString()}</p>
        </div>
      </section>

      <section className="space-y-4">
        {payments.map((payment) => (
          <div key={payment.id} className="border rounded p-4 space-y-2">
            <h2 className="text-xl font-semibold">{payment.name}</h2>

            <p>Monto: ${Number(payment.amount || 0).toLocaleString()}</p>

            <p>
              Fecha efectiva:{' '}
              {new Date(payment.effective_due_date).toLocaleDateString('es-PR', {
                timeZone: 'America/Puerto_Rico',
              })}
            </p>

            <p>
              Estado: <strong>{payment.status}</strong>
            </p>

            <p>Responsable: {payment.owner || 'N/A'}</p>

            {payment.notes && (
              <p className="text-sm opacity-80">Notas: {payment.notes}</p>
            )}

            <div className="flex gap-2 flex-wrap pt-2">
              <button
                className="border rounded p-2"
                onClick={() => updateStatus(payment.id, 'pending')}
              >
                🔴 Pendiente
              </button>

              <button
                className="border rounded p-2"
                onClick={() => updateStatus(payment.id, 'promise')}
              >
                🟡 Promesa
              </button>

              <button
                className="border rounded p-2"
                onClick={() => updateStatus(payment.id, 'paid')}
              >
                🟢 Pagado
              </button>
            </div>
          </div>
        ))}
      </section>

      {liabilitiesWithSuggested.length > 0 && (
        <section className="border rounded p-4">
          <h2 className="text-2xl font-bold mb-4">🏦 Deudas grandes / préstamos</h2>
          <div className="space-y-3">
            {liabilitiesWithSuggested.map((l) => (
              <div key={l.id} className="border rounded p-4">
                <div className="flex items-center justify-between">
                  <strong>{l.name}</strong>
                  <span className="text-sm opacity-70">{l.status === 'due_today' ? 'Vence hoy' : l.status === 'in_grace' ? 'En gracia' : l.status === 'overdue' ? 'Vencida' : l.status === 'due_soon' ? 'Próxima' : ''}</span>
                </div>
                <p>Monto mensual: ${Number(l.monthly_payment || 0).toLocaleString()}</p>
                <p>Vence día: {l.due_day || 'N/A'}</p>
                {l.grace_day && <p>Fecha límite / gracia: día {l.grace_day}</p>}
                <p>Balance: ${Number(l.balance || 0).toLocaleString()}</p>
                <p className="text-sm opacity-80">Estado sugerido: {l.suggested === 'attention' ? 'Requiere atención' : l.suggested === 'overdue' ? 'Vencida - acción requerida' : l.suggested === 'soon' ? 'Próxima' : 'Normal'}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
