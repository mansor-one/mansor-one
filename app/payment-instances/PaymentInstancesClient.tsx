'use client'

import type {
  LegacyLiability,
  LegacyPaymentInstance,
} from '@/lib/financial-engine'

type SuggestedLiability = LegacyLiability & {
  status: string
  suggested: string
}

function hasMatchingPayment(
  payments: LegacyPaymentInstance[],
  liabilityName: string,
  isPaid: boolean = false
) {
  return payments.some((payment) => {
    if (isPaid && payment.status !== 'paid') return false
    if (!isPaid && payment.status === 'paid') return false
    const paymentName = String(payment.name || '').toLowerCase().trim()
    const normalizedLiabilityName = String(liabilityName || '')
      .toLowerCase()
      .trim()
    return (
      paymentName.includes(normalizedLiabilityName.split(' ')[0]) ||
      normalizedLiabilityName.includes(paymentName.split(' ')[0])
    )
  })
}

function suggestLiabilities(
  payments: LegacyPaymentInstance[],
  liabilities: LegacyLiability[]
): SuggestedLiability[] {
  const liabilitiesDueNotInPayments = liabilities.filter((liability) => {
    if (!liability.monthly_payment) return false
    return !hasMatchingPayment(payments, liability.name || '', true)
  })

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const msPerDay = 1000 * 60 * 60 * 24

  return liabilitiesDueNotInPayments.map((liability) => {
    const dueDay = liability.due_day ? Number(liability.due_day) : null
    const graceDay = liability.grace_day ? Number(liability.grace_day) : null
    let suggested = 'normal'
    let status = 'normal'

    if (dueDay) {
      const dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay)
      const daysUntil = Math.ceil(
        (dueDate.getTime() - today.getTime()) / msPerDay
      )
      if (daysUntil === 0) {
        status = 'due_today'
        suggested = 'attention'
      } else if (daysUntil < 0) {
        if (graceDay) {
          const graceDate = new Date(now.getFullYear(), now.getMonth(), graceDay)
          if (today.getTime() <= graceDate.getTime()) {
            status = 'in_grace'
            suggested = 'attention'
          } else {
            status = 'overdue'
            suggested = 'overdue'
          }
        } else {
          status = 'overdue'
          suggested = 'overdue'
        }
      } else if (daysUntil > 0 && daysUntil <= 7) {
        status = 'due_soon'
        suggested = 'soon'
      }
    }

    return { ...liability, status, suggested }
  })
}

function statusLabel(status: string) {
  if (status === 'due_today') return 'Vence hoy'
  if (status === 'in_grace') return 'En gracia'
  if (status === 'overdue') return 'Vencida'
  if (status === 'due_soon') return 'Próxima'
  return ''
}

function suggestedLabel(suggested: string) {
  if (suggested === 'attention') return 'Requiere atención'
  if (suggested === 'overdue') return 'Vencida - acción requerida'
  if (suggested === 'soon') return 'Próxima'
  return 'Normal'
}

export default function PaymentInstancesClient({
  payments,
  liabilities,
  message,
}: {
  payments: LegacyPaymentInstance[]
  liabilities: LegacyLiability[]
  message?: string | null
}) {
  const totalPending = payments
    .filter((payment) => payment.status !== 'paid')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

  const totalPaid = payments
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

  const liabilitiesWithSuggested = suggestLiabilities(payments, liabilities)

  return (
    <>
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
              {new Date(payment.effective_due_date).toLocaleDateString(
                'es-PR',
                {
                  timeZone: 'America/Puerto_Rico',
                }
              )}
            </p>

            <p>
              Estado: <strong>{payment.status}</strong>
            </p>

            <p>Responsable: {payment.owner || 'N/A'}</p>

            {payment.notes && (
              <p className="text-sm opacity-80">Notas: {payment.notes}</p>
            )}

            <div className="flex gap-2 flex-wrap pt-2">
              <button className="border rounded p-2" disabled>
                🔴 Pendiente
              </button>

              <button className="border rounded p-2" disabled>
                🟡 Promesa
              </button>

              <button className="border rounded p-2" disabled>
                🟢 Pagado
              </button>
            </div>
          </div>
        ))}
      </section>

      {liabilitiesWithSuggested.length > 0 && (
        <section className="border rounded p-4">
          <h2 className="text-2xl font-bold mb-4">
            🏦 Deudas grandes / préstamos
          </h2>
          <div className="space-y-3">
            {liabilitiesWithSuggested.map((liability) => (
              <div key={liability.id} className="border rounded p-4">
                <div className="flex items-center justify-between">
                  <strong>{liability.name}</strong>
                  <span className="text-sm opacity-70">
                    {statusLabel(liability.status)}
                  </span>
                </div>
                <p>
                  Monto mensual: $
                  {Number(liability.monthly_payment || 0).toLocaleString()}
                </p>
                <p>Vence día: {liability.due_day || 'N/A'}</p>
                {liability.grace_day && (
                  <p>Fecha límite / gracia: día {liability.grace_day}</p>
                )}
                <p>
                  Balance: ${Number(liability.balance || 0).toLocaleString()}
                </p>
                <p className="text-sm opacity-80">
                  Estado sugerido: {suggestedLabel(liability.suggested)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
