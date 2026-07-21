'use client'

import { useEffect, useState } from 'react'

type StepState = 'waiting' | 'running' | 'completed' | 'failed'
type SyncRun = {
  id: string; status: 'queued' | 'running' | 'partially_completed' | 'completed' | 'failed'; current_step: string | null
  completed_steps: number; total_steps: number; percentage: number; started_at: string | null; completed_at: string | null
  error_message: string | null; retryable_step: string | null; duration_ms: number | null; summary: Record<string, number>; warnings: string[]; step_results: Record<string, unknown>; created_at: string; last_successful_at?: string | null
}

const steps = [
  ['accounts', 'Cuentas y balances'], ['liabilities', 'Tarjetas y préstamos'], ['transactions', 'Transacciones'],
  ['reconciliation', 'Conciliación'], ['financial_refresh', 'Actualización financiera'],
] as const

function date(value: string | null | undefined) { return value ? new Date(value).toLocaleString('es-PR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin sincronización registrada' }
function duration(ms: number | null | undefined) { return ms ? `${(ms / 1000).toFixed(1)} s` : '—' }
function stateFor(run: SyncRun | null, index: number): StepState {
  if (!run) return 'waiting'
  if (index < run.completed_steps) return 'completed'
  if (run.retryable_step === steps[index][0] && ['failed', 'partially_completed'].includes(run.status)) return 'failed'
  if (run.current_step === steps[index][0] && run.status === 'running') return 'running'
  return 'waiting'
}
const stateLabel: Record<StepState, string> = { waiting: 'En espera', running: 'En progreso', completed: 'Completado', failed: 'Falló' }
const stateIcon: Record<StepState, string> = { waiting: '○', running: '↻', completed: '✓', failed: '!' }
const runLabel = { queued: 'En cola', running: 'En progreso', partially_completed: 'Completada parcialmente', completed: 'Completada', failed: 'Falló' }

export default function PlaidSyncActions({ initialRun, connectionNeedsAttention }: { initialRun: SyncRun | null; connectionNeedsAttention: boolean }) {
  const [run, setRun] = useState(initialRun)
  const [error, setError] = useState<string | null>(null)
  const active = run?.status === 'queued' || run?.status === 'running'

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(async () => {
      const response = await fetch('/api/plaid/sync', { cache: 'no-store' })
      if (response.ok) setRun((await response.json()).run)
    }, 1500)
    return () => window.clearInterval(timer)
  }, [active])

  async function start(retry = false) {
    setError(null)
    const response = await fetch('/api/plaid/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(retry ? { retry_run_id: run?.id } : {}) })
    const result = await response.json()
    if (!response.ok) { setError(result.error || 'No pudimos iniciar la sincronización.'); return }
    setRun(result.run)
  }

  const lastSuccess = run?.last_successful_at || (run?.status === 'completed' ? run.completed_at : null)
  const nextAutomatic = new Date(); nextAutomatic.setUTCHours(10, 15, 0, 0); if (nextAutomatic <= new Date()) nextAutomatic.setUTCDate(nextAutomatic.getUTCDate() + 1)
  return <section className="rounded border border-neutral-800 bg-neutral-900 p-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-sm text-neutral-400">Sincronización diaria</p><h2 className="text-xl font-bold">Plaid y Motor Financiero</h2><p className="text-sm text-neutral-400">Un solo flujo actualiza las fuentes en el orden correcto.</p></div><button className="rounded border border-sky-700 bg-sky-950/40 px-4 py-2 font-semibold text-sky-100 disabled:opacity-50" disabled={active} onClick={() => start(false)} type="button">{active ? `Sincronizando ${run?.percentage || 0}%` : 'Sincronizar ahora'}</button></div>
    <p className="mt-4 text-sm"><span className="text-neutral-400">Estado:</span> {run ? runLabel[run.status] : 'Lista para sincronizar'} · {run?.completed_steps || 0} de {run?.total_steps || 5} pasos</p><div className="mt-2 h-2 overflow-hidden rounded bg-neutral-800" aria-label={`Progreso ${run?.percentage || 0}%`}><div className="h-full bg-sky-500 transition-all" style={{ width: `${run?.percentage || 0}%` }} /></div>
    <div className="mt-4 grid gap-2 md:grid-cols-5">{steps.map(([id, label], index) => { const state = stateFor(run, index); return <div className={`rounded border p-3 text-sm ${state === 'failed' ? 'border-red-700' : state === 'completed' ? 'border-emerald-800' : state === 'running' ? 'border-sky-600' : 'border-neutral-800'}`} key={id}><p className="font-semibold"><span aria-hidden>{stateIcon[state]}</span> {label}</p><p className="text-xs text-neutral-400">{stateLabel[state]}</p></div> })}</div>
    {run && <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-neutral-500">Última sincronización exitosa</p><p>{date(lastSuccess)}</p></div><div><p className="text-neutral-500">Último intento</p><p>{date(run.started_at || run.created_at)}</p></div><div><p className="text-neutral-500">Próxima sincronización automática</p><p>{date(nextAutomatic.toISOString())}</p></div><div><p className="text-neutral-500">Conexión</p><p>{connectionNeedsAttention ? 'Requiere atención' : 'Conectado'}</p></div></div>}
    {run && ['completed', 'partially_completed', 'failed'].includes(run.status) && <div className="mt-4 rounded border border-neutral-800 p-4 text-sm"><h3 className="font-bold">Resumen</h3><p>Cuentas actualizadas: {run.summary?.accounts_updated || 0} · tarjetas y préstamos actualizados: {run.summary?.liabilities_updated || 0} · transacciones añadidas o actualizadas: {run.summary?.transactions_added_or_updated || 0} · pagos conciliados: {run.summary?.payments_reconciled || 0} · duración: {duration(run.duration_ms)}</p>{run.error_message && <><p className="mt-2 text-red-200">{run.retryable_step === 'transactions' ? 'No pudimos actualizar las transacciones.' : `No pudimos completar ${steps.find(([id]) => id === run.retryable_step)?.[1] || 'la sincronización'}.`}</p>{run.completed_steps > 0 && <p className="text-neutral-300">{run.retryable_step === 'transactions' && run.completed_steps >= 2 ? 'Las cuentas y tarjetas sí quedaron actualizadas.' : 'Los pasos anteriores sí quedaron actualizados.'}</p>}<button className="mt-3 rounded border border-amber-700 px-3 py-2 font-semibold" onClick={() => start(true)} type="button">Reintentar desde {steps.find(([id]) => id === run.retryable_step)?.[1]?.toLowerCase() || 'el paso pendiente'}</button></>}{run.warnings?.length ? <ul className="mt-2 list-disc pl-5 text-amber-200">{run.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}</div>}
    {error && <p className="mt-4 rounded border border-red-700 p-3 text-red-100">{error}</p>}
    <details className="mt-4 rounded border border-neutral-800 p-3"><summary className="cursor-pointer font-semibold">Ver detalles técnicos</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-neutral-400">{JSON.stringify(run, null, 2)}</pre><div className="mt-3 flex gap-2"><button className="rounded border px-3 py-2 text-xs" disabled={active} onClick={() => fetch('/api/plaid/sync-accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })} type="button">Solo cuentas</button><button className="rounded border px-3 py-2 text-xs" disabled={active} onClick={() => fetch('/api/plaid/sync-imports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })} type="button">Solo transacciones</button></div></details>
  </section>
}
