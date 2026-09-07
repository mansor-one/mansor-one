'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ObligationConfigurationItem } from '@/lib/financial-engine/obligation-configuration'
import { StatusBadge } from '../components/ui-primitives'

function fieldClass() {
  return 'mt-1 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/25'
}

function ConfigurationCard({ item }: { item: ObligationConfigurationItem }) {
  const router = useRouter()
  const [amount, setAmount] = useState(item.amount?.toString() || '')
  const [dueDay, setDueDay] = useState(item.dueDay?.toString() || '')
  const [owner, setOwner] = useState(item.owner || '')
  const [recurrence, setRecurrence] = useState(item.recurrence || '')
  const [recurrenceInterval, setRecurrenceInterval] = useState(item.recurrenceInterval?.toString() || '1')
  const [anchorDate, setAnchorDate] = useState(item.anchorDate || '')
  const [paymentMethod, setPaymentMethod] = useState(item.paymentMethod || '')
  const [dueDayConfirmed, setDueDayConfirmed] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function save() {
    setStatus('saving')
    setMessage('')
    try {
      const response = await fetch('/api/obligations/configuration', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          source: item.source,
          amount,
          dueDay,
          owner,
          recurrence,
          recurrenceInterval,
          anchorDate,
          paymentMethod,
          confirmDueDayConflict:
            item.requiresDueDayConfirmation && dueDayConfirmed,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar.')
      setStatus('saved')
      setMessage('Configuración guardada. No se crearon pagos.')
      router.refresh()
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar.')
    }
  }

  return (
    <article className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.055] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="warning">Needs Configuration</StatusBadge>
            <StatusBadge tone="neutral">
              {item.source === 'obligation' ? 'Canónica' : 'Legacy'}
            </StatusBadge>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-white">{item.name}</h3>
          <p className="mt-1 text-sm text-slate-400">
            Completa solamente datos contractuales confirmados. Este formulario no genera instancias ni pagos.
          </p>
        </div>
        <span className="text-sm font-semibold text-amber-200">
          {item.issues.length} campo(s) pendientes
        </span>
      </div>

      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {item.issues.map((missing) => (
          <li className="rounded-lg border border-amber-300/15 bg-black/15 p-3" key={missing.code}>
            <p className="text-sm font-semibold text-amber-100">{missing.label}</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">{missing.explanation}</p>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm text-slate-300">
          Monto esperado
          <input className={fieldClass()} min="0.01" onChange={(event) => setAmount(event.target.value)} step="0.01" type="number" value={amount} />
        </label>
        <label className="text-sm text-slate-300">
          Día de vencimiento
          <input className={fieldClass()} max="31" min="1" onChange={(event) => setDueDay(event.target.value)} type="number" value={dueDay} />
        </label>
        <label className="text-sm text-slate-300">
          Responsable
          <select className={fieldClass()} onChange={(event) => setOwner(event.target.value)} value={owner}>
            <option value="">Seleccionar</option>
            <option value="Manuel">Manuel</option>
            <option value="Soraya">Soraya</option>
            <option value="household">Hogar</option>
          </select>
        </label>
        <label className="text-sm text-slate-300">
          Recurrencia
          <select className={fieldClass()} onChange={(event) => setRecurrence(event.target.value)} value={recurrence}>
            <option value="">Seleccionar</option>
            <option value="monthly">Mensual</option>
            <option value="biweekly">Cada 14 días</option>
            <option value="quarterly">Trimestral</option>
            <option value="annual">Anual</option>
            <option value="one_time">Una vez</option>
            <option value="custom">Personalizada</option>
          </select>
        </label>
        {recurrence === 'biweekly' && (
          <label className="text-sm text-slate-300">
            Fecha ancla contractual
            <input className={fieldClass()} onChange={(event) => setAnchorDate(event.target.value)} type="date" value={anchorDate} />
          </label>
        )}
        {recurrence === 'custom' && (
          <label className="text-sm text-slate-300">
            Intervalo en meses
            <input className={fieldClass()} max="24" min="1" onChange={(event) => setRecurrenceInterval(event.target.value)} type="number" value={recurrenceInterval} />
          </label>
        )}
        {item.canConfigurePaymentAccount ? (
          <label className="text-sm text-slate-300">
            Cuenta o método habitual
            <input className={fieldClass()} onChange={(event) => setPaymentMethod(event.target.value)} placeholder="Ej. Cuenta Familiar" value={paymentMethod} />
          </label>
        ) : (
          <div className="rounded-lg border border-sky-400/15 bg-sky-400/8 p-3 text-xs leading-5 text-sky-100">
            La relación estructurada con una cuenta se configurará al migrar este calendario legacy al modelo canónico.
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {item.requiresDueDayConfirmation && (
          <label className="flex w-full items-start gap-3 rounded-lg border border-purple-300/20 bg-purple-400/8 p-3 text-sm text-purple-100">
            <input className="mt-1" checked={dueDayConfirmed} onChange={(event) => setDueDayConfirmed(event.target.checked)} type="checkbox" />
            <span>Confirmo explícitamente que el día contractual seleccionado es correcto y sustituye la fecha conflictiva anterior.</span>
          </label>
        )}
        <button className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={status === 'saving' || (item.requiresDueDayConfirmation && !dueDayConfirmed)} onClick={save} type="button">
          {status === 'saving' ? 'Guardando…' : 'Guardar configuración'}
        </button>
        {message && <p className={`text-sm ${status === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>{message}</p>}
      </div>
    </article>
  )
}

export default function NeedsConfiguration({ items }: { items: ObligationConfigurationItem[] }) {
  return (
    <section className="space-y-4" id="needs-configuration">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Validación de datos maestros</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Needs Configuration</h2>
          <p className="mt-1 text-sm text-slate-400">Obligaciones que todavía no tienen información suficiente para una proyección confiable.</p>
        </div>
        <StatusBadge tone={items.length ? 'warning' : 'success'}>{items.length} pendientes</StatusBadge>
      </div>
      {items.length ? items.map((item) => <ConfigurationCard item={item} key={`${item.source}:${item.id}`} />) : (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/8 p-5 text-sm text-emerald-100">Todas las obligaciones activas tienen la configuración mínima disponible en su modelo actual.</div>
      )}
    </section>
  )
}
