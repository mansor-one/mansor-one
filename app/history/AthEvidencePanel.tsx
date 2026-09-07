'use client'

import { useState } from 'react'
import type { HistoryMovement } from './HistoryClient'

type AthEvidence = {
  id: string
  score: number
  status: string
  reasons?: Array<{ message?: string }>
  email?: {
    counterparty_name?: string | null
    counterparty_phone_last4?: string | null
    occurred_at?: string | null
    message?: string | null
    reference?: string | null
  }
}

export default function AthEvidencePanel({ movement, initialEvidence, onClose }: {
  movement: HistoryMovement
  initialEvidence: Array<Record<string, unknown>>
  onClose: () => void
}) {
  const [evidence, setEvidence] = useState(initialEvidence as AthEvidence[])
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function decide(candidateId: string, action: 'confirm' | 'reject') {
    setPendingId(candidateId)
    setMessage('')
    try {
      const response = await fetch(`/api/ath-movil/candidates/${candidateId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) {
        setMessage(result.error || 'No se pudo guardar la decisión.')
        return
      }
      setEvidence((current) => current.map((item) => {
        if (item.id === candidateId) return { ...item, status: action === 'confirm' ? 'confirmed' : 'rejected' }
        if (action === 'confirm' && item.status === 'suggested') return { ...item, status: 'superseded' }
        return item
      }))
      setMessage(action === 'confirm' ? 'Evidencia ATH confirmada.' : 'Coincidencia rechazada.')
    } catch {
      setMessage('No se pudo guardar la decisión.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-label="Detalle de transacción">
      <aside className="mobile-safe-drawer h-full w-full max-w-lg overflow-y-auto bg-[#081225] p-6 text-slate-100 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs uppercase tracking-wide text-sky-300">Detalle de transacción</p><h2 className="text-2xl font-bold">{movement.merchant}</h2></div>
          <button className="min-h-11 min-w-11 rounded border px-3 py-2" onClick={onClose} type="button">Cerrar</button>
        </div>
        <section className="mt-6 rounded-xl border border-slate-700 p-4">
          <h3 className="font-bold">Contexto ATH Móvil</h3>
          {evidence.length === 0 ? <p className="mt-2 text-slate-300">Sin coincidencia.</p> : (
            <div className="mt-3 space-y-3">{evidence.map((item) => (
              <article className="rounded border border-slate-700 bg-slate-950/40 p-3" key={item.id}>
                <p className="font-semibold">{item.status === 'confirmed' ? 'Evidencia confirmada' : item.status === 'rejected' ? 'Coincidencia rechazada' : item.status === 'superseded' ? 'Alternativa descartada' : 'Sugerencia pendiente'} · {item.score}/100</p>
                <p className="text-sm text-slate-300">{item.email?.counterparty_name || 'ATH Móvil'}{item.email?.counterparty_phone_last4 ? ` · •••• ${item.email.counterparty_phone_last4}` : ''}</p>
                {item.email?.occurred_at && <p className="mt-1 text-sm">{new Date(item.email.occurred_at).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico' })}</p>}
                {item.email?.message && <p className="mt-1 text-sm">Mensaje: {item.email.message}</p>}
                {item.email?.reference && <p className="mt-1 text-sm">Referencia: ••••{item.email.reference.slice(-4)}</p>}
                {item.reasons?.map((reason, index) => <p className="mt-1 text-xs text-slate-400" key={`${item.id}-${index}`}>{reason.message}</p>)}
                {item.status === 'suggested' && <div className="mt-3 flex flex-wrap gap-2"><button className="rounded bg-sky-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-60" disabled={Boolean(pendingId)} onClick={() => decide(item.id, 'confirm')} type="button">Confirmar relación</button><button className="rounded border border-slate-500 px-3 py-2 text-sm disabled:opacity-60" disabled={Boolean(pendingId)} onClick={() => decide(item.id, 'reject')} type="button">No corresponde</button></div>}
              </article>
            ))}</div>
          )}
          {message && <p className="mt-3 text-sm" role="status">{message}</p>}
        </section>
      </aside>
    </div>
  )
}
