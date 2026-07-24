'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { PaymentAccountOption } from '@/lib/financial-engine/payment-account-options'

export default function ConfirmObligationPaid({
  obligationInstanceId,
  amount,
  defaultPaymentMethod,
  paymentAccounts = [],
  suggestedAccount,
  existingPayment,
  submissionMethod,
}: {
  obligationInstanceId: string
  amount?: number | null
  defaultPaymentMethod?: string | null
  paymentAccounts?: PaymentAccountOption[]
  suggestedAccount?: { id: string; reason: string } | null
  existingPayment?: {
    reportedAmount?: number | null
    confirmedAt?: string | null
    paymentMethod?: string | null
    paymentAccountId?: string | null
    paymentAccountSource?: string | null
    note?: string | null
  } | null
  submissionMethod?: 'POST' | 'PATCH'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedValue, setSelectedValue] = useState(() => {
    if (existingPayment?.paymentAccountSource) {
      return `${existingPayment.paymentAccountSource}:${existingPayment.paymentAccountId || ''}`
    }
    const suggested = paymentAccounts.find((account) => account.id === suggestedAccount?.id)
    return suggested ? `${suggested.source}:${suggested.id}` : ''
  })

  async function submit(formData: FormData) {
    setSaving(true)
    setError(null)
    const response = await fetch('/api/obligations/confirm-paid', {
      method: submissionMethod || (existingPayment ? 'PATCH' : 'POST'),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        obligationInstanceId,
        amount: formData.get('amount'),
        confirmationDate: formData.get('confirmationDate'),
        paymentMethod: formData.get('paymentMethod'),
        paymentAccountId: formData.get('paymentAccountId'),
        paymentAccountSource: formData.get('paymentAccountSource'),
        note: formData.get('note'),
        updateFutureDefault: formData.get('updateFutureDefault') === 'on',
      }),
    })
    const payload = await response.json()
    setSaving(false)
    if (!response.ok) {
      setError(payload.error || 'No se pudo guardar la confirmación')
      return
    }
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return <button className="mt-3 rounded border px-3 py-2 font-semibold" onClick={() => setOpen(true)}>{existingPayment ? 'Editar pago' : 'Sí, ya pagué esto'}</button>
  }

  const [paymentAccountSource, paymentAccountId = ''] = selectedValue.split(':')
  const selectedAccount = paymentAccounts.find((account) => account.id === paymentAccountId)

  return <form action={submit} className="mt-3 space-y-2 rounded border p-3">
    <label className="block">Importe pagado<input className="mt-1 block w-full rounded border border-neutral-700 bg-neutral-950 p-2" min="0.01" name="amount" step="0.01" type="number" defaultValue={existingPayment?.reportedAmount ?? amount ?? ''} required /></label>
    <label className="block">Fecha reportada<input className="mt-1 block w-full rounded border border-neutral-700 bg-neutral-950 p-2" name="confirmationDate" type="date" defaultValue={existingPayment?.confirmedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10)} required /></label>
    <label className="block">Cuenta o método de pago
      <select className="mt-1 block w-full rounded border border-neutral-700 bg-neutral-950 p-2" value={selectedValue} onChange={(event) => setSelectedValue(event.target.value)} required>
        <option value="">Selecciona una opción</option>
        {paymentAccounts.map((account) => <option key={`${account.source}:${account.id}`} value={`${account.source}:${account.id}`}>{account.institution} — {account.name}{account.suffix ? ` •••• ${account.suffix}` : ''}{account.usableBalance !== null ? ` · Disponible $${account.usableBalance.toFixed(2)}` : ''}</option>)}
        <option value="cash:">Efectivo</option>
        <option value="other:">Otra cuenta o método</option>
      </select>
    </label>
    <input name="paymentAccountId" type="hidden" value={paymentAccountId} />
    <input name="paymentAccountSource" type="hidden" value={paymentAccountSource || ''} />
    {suggestedAccount && selectedAccount?.id === suggestedAccount.id && <p className="text-xs text-sky-200">Sugerencia: {suggestedAccount.reason}</p>}
    {paymentAccountSource === 'other' && <label className="block">Describe el método<input className="mt-1 block w-full rounded border border-neutral-700 bg-neutral-950 p-2" name="paymentMethod" defaultValue={existingPayment?.paymentMethod || defaultPaymentMethod || ''} required /></label>}
    {paymentAccountSource !== 'other' && <input name="paymentMethod" type="hidden" value={selectedAccount ? `${selectedAccount.institution} — ${selectedAccount.name}` : paymentAccountSource === 'cash' ? 'Efectivo' : existingPayment?.paymentMethod || defaultPaymentMethod || ''} />}
    <label className="block">Nota opcional<textarea className="mt-1 block w-full rounded border border-neutral-700 bg-neutral-950 p-2" name="note" defaultValue={existingPayment?.note || ''} /></label>
    <label className="flex items-start gap-2 rounded border border-neutral-700 p-2"><input className="mt-1" name="updateFutureDefault" type="checkbox" /><span><strong>Usar este importe en ciclos futuros</strong><span className="block text-xs text-neutral-400">Actualiza el importe esperado de la obligación sin cambiar ciclos históricos.</span></span></label>
    {error && <p className="text-red-600">{error}</p>}
    <div className="flex gap-2"><button className="rounded border px-3 py-2 font-semibold" disabled={saving}>{saving ? 'Guardando…' : existingPayment ? 'Guardar corrección' : 'Confirmar pago'}</button><button className="rounded border px-3 py-2" type="button" onClick={() => setOpen(false)}>Cancelar</button></div>
  </form>
}
