'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type ImportResult = {
  ok?: boolean
  error?: string
  gmailFound?: number
  inserted?: number
  candidatesCreated?: number
  reprocessed?: number
  parsed?: number
  ignored?: number
}

export default function AthGmailActions({ authorizationStatus }: { authorizationStatus?: string }) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function importEvidence() {
    setRunning(true)
    setResult(null)
    try {
      const response = await fetch('/api/gmail/ath-import', { method: 'POST' })
      const payload = await response.json() as ImportResult
      setResult(response.ok ? payload : { error: payload.error || 'No pudimos importar la evidencia ATH.' })
      if (response.ok) router.refresh()
    } catch {
      setResult({ error: 'No pudimos importar la evidencia ATH.' })
    } finally {
      setRunning(false)
    }
  }

  async function reprocessEvidence() {
    setRunning(true)
    setResult(null)
    try {
      const response = await fetch('/api/gmail/ath-reprocess', { method: 'POST' })
      const payload = await response.json() as ImportResult
      setResult(response.ok ? payload : { error: payload.error || 'No pudimos reprocesar la evidencia ATH.' })
      if (response.ok) router.refresh()
    } catch {
      setResult({ error: 'No pudimos reprocesar la evidencia ATH.' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="mb-5 rounded-xl border border-sky-500/30 bg-[#0b1730] p-4" aria-label="Sincronización Gmail de ATH Móvil">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-white">Evidencia desde Gmail</h2>
          <p className="mt-1 text-sm text-slate-300">Conecta la cuenta autorizada y busca recibos ATH. Esto no crea ni modifica movimientos financieros.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="rounded-lg border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400" href="/api/auth/google/start">Conectar Gmail</a>
          <button className="rounded-lg bg-sky-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300" disabled={running} onClick={importEvidence} type="button">{running ? 'Importando…' : 'Importar evidencia'}</button>
          <button className="rounded-lg border border-sky-400/60 px-3 py-2 text-sm font-semibold text-sky-100 disabled:opacity-60" disabled={running} onClick={reprocessEvidence} type="button">Reprocesar incompletos</button>
        </div>
      </div>
      {authorizationStatus === 'connected' && <p className="mt-3 text-sm text-emerald-300" role="status">Gmail quedó autorizado. Ya puedes importar evidencia.</p>}
      {authorizationStatus === 'authorization_denied' && <p className="mt-3 text-sm text-amber-300" role="status">No se autorizó Gmail. Puedes intentarlo nuevamente cuando estés listo.</p>}
      {result?.error && <p className="mt-3 text-sm text-rose-300" role="alert">{result.error}</p>}
      {result?.ok && result.reprocessed === undefined && <p className="mt-3 text-sm text-emerald-300" role="status">Encontrados: {result.gmailFound || 0} · Nuevos correos: {result.inserted || 0} · Sugerencias nuevas: {result.candidatesCreated || 0}</p>}
      {result?.ok && result.reprocessed !== undefined && <p className="mt-3 text-sm text-emerald-300" role="status">Reprocesados: {result.reprocessed} · Completos: {result.parsed || 0} · No financieros ignorados: {result.ignored || 0} · Sugerencias nuevas: {result.candidatesCreated || 0}</p>}
    </section>
  )
}
