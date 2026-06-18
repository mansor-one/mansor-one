'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default function PaymentInstancesPage() {
  const [payments, setPayments] = useState<any[]>([])
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
    </main>
  )
}
