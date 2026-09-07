'use client'

import Link from 'next/link'
import type { PaymentInstance } from '@/lib/financial-engine'
import { filterLegacyObligationCandidates } from '@/lib/financial-engine/legacy-obligation-candidates'
import { useEffect, useMemo, useState } from 'react'

type Candidate = {
  id: string
  entry_date: string
  description: string
  amount: number
  account_name: string | null
  entry_type: string
  exactAmount: boolean
  source: 'quick_entries' | 'plaid_imports'
  confirmed: boolean
  financialImpact: 'expense' | 'statement_credit'
  institution_name?: string | null
  score?: number
  reasons?: string[]
  amountBehavior?: 'fixed' | 'estimated'
  requiresManualConfirmation?: boolean
}

type ExistingObligation = {
  id: string
  name: string
  default_amount: number | null
  frequency: string
  owner: string
  category_code: string | null
}

type Setup = {
  obligations: ExistingObligation[]
  candidates: Candidate[]
  searchWindowDays: number
}

function money(value: unknown) {
  return `$${Math.abs(Number(value || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ConfigureLegacyObligation({ payment }: { payment: PaymentInstance }) {
  const scheduleId = payment.scheduled_payment_id
  const expectedDate = payment.due_date || payment.expected_date || ''
  const [setup, setSetup] = useState<Setup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [candidateSearch, setCandidateSearch] = useState('')
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const [confirmedAmountDifference, setConfirmedAmountDifference] = useState(false)
  const [configuredAmount, setConfiguredAmount] = useState(
    Number(payment.amount || 0)
  )

  const visibleCandidates = useMemo(() => {
    if (!setup) return { candidates: [], usedExactAmountFallback: false }
    return filterLegacyObligationCandidates(setup.candidates, candidateSearch)
  }, [candidateSearch, setup])
  const selectedCandidate = setup?.candidates.find(
    (candidate) => candidate.id === selectedCandidateId
  ) || null
  const selectedAmountDifference = selectedCandidate
    ? Math.abs(selectedCandidate.amount) - configuredAmount
    : 0
  const hasAmountDifference = Boolean(
    selectedCandidate && Math.abs(selectedAmountDifference) >= 0.01
  )

  useEffect(() => {
    if (!scheduleId || !expectedDate) return
    const controller = new AbortController()
    const query = new URLSearchParams({ scheduledPaymentId: scheduleId, expectedDate })
    fetch(`/api/obligations/configure-legacy?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'No se pudo cargar la configuración.')
        setSetup(payload)
      })
      .catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message) })
    return () => controller.abort()
  }, [expectedDate, scheduleId])

  if (!scheduleId || !expectedDate) {
    return <p className="rounded border border-amber-800 p-3 text-amber-100">Este registro legacy no tiene identidad o fecha suficiente para migrarlo.</p>
  }
  if (error) return <p className="rounded border border-red-800 p-3 text-red-100">{error}</p>
  if (!setup) return <p className="text-sm text-slate-400">Buscando obligaciones y transacciones confirmadas…</p>

  async function submit(formData: FormData) {
    setSaving(true)
    setError(null)
    const response = await fetch('/api/obligations/configure-legacy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scheduledPaymentId: scheduleId,
        existingObligationId: formData.get('existingObligationId') || null,
        name: formData.get('name'),
        owner: formData.get('owner'),
        categoryCode: formData.get('categoryCode'),
        obligationType: formData.get('obligationType'),
        frequency: formData.get('frequency'),
        amount: Number(formData.get('amount')),
        expectedDate,
        effectiveDueDate: formData.get('effectiveDueDate'),
        candidateId: selectedCandidate?.id,
        candidateSource: selectedCandidate?.source,
        confirmAmountDifference: hasAmountDifference
          ? confirmedAmountDifference
          : true,
      }),
    })
    const payload = await response.json()
    setSaving(false)
    if (!response.ok) {
      setError(payload.error || 'No se pudo guardar la migración.')
      return
    }
    window.location.reload()
  }

  return <form action={submit} className="space-y-4 rounded-xl border border-amber-700/60 bg-amber-950/15 p-4">
    <div><h3 className="font-bold text-white">Configurar obligación</h3><p className="text-sm text-slate-300">Se conservará el calendario anterior, se cerrará esta instancia con la transacción seleccionada y se creará el próximo ciclo.</p></div>
    <div className="rounded-lg border border-sky-300/20 bg-sky-400/[0.06] p-3 text-sm text-sky-100">
      <p className="font-semibold">¿Hay varios pagos o un posible reimbursement?</p>
      <p className="mt-1 text-sky-100/80">Abre la revisión read-only para explorar la evidencia sin guardar, promover ni reconciliar nada.</p>
      <Link className="mt-3 inline-flex rounded-lg border border-sky-300/30 px-3 py-2 font-semibold" href={`/repair-center/obligation-review?scheduledPaymentId=${encodeURIComponent(scheduleId)}&expectedDate=${encodeURIComponent(expectedDate)}`}>
        Revisar evidencia sin guardar
      </Link>
    </div>
    <label className="block text-sm">Obligación existente opcional<select className="mt-1 w-full rounded border border-white/15 bg-[#07101f] p-2" name="existingObligationId" defaultValue=""><option value="">Crear una obligación canónica nueva</option>{setup.obligations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Nombre<input className="mt-1 w-full rounded border border-white/15 bg-[#07101f] p-2" name="name" defaultValue={payment.name || ''} required /></label>
      <label className="text-sm">Responsable<select className="mt-1 w-full rounded border border-white/15 bg-[#07101f] p-2" name="owner" defaultValue={payment.owner || 'household'}><option value="Manuel">Manuel</option><option value="Soraya">Soraya</option><option value="household">Hogar</option><option value="unknown">Sin definir</option></select></label>
      <label className="text-sm">Importe esperado<input className="mt-1 w-full rounded border border-white/15 bg-[#07101f] p-2" name="amount" type="number" min="0.01" step="0.01" onChange={(event) => { setConfiguredAmount(Number(event.target.value)); setConfirmedAmountDifference(false) }} value={configuredAmount} required /></label>
      <label className="text-sm">Frecuencia<select className="mt-1 w-full rounded border border-white/15 bg-[#07101f] p-2" name="frequency" defaultValue="monthly"><option value="monthly">Mensual</option><option value="quarterly">Trimestral</option><option value="annual">Anual</option></select></label>
      <label className="text-sm">Categoría<input className="mt-1 w-full rounded border border-white/15 bg-[#07101f] p-2" name="categoryCode" defaultValue={payment.obligationCategoryCode || 'debt_credit_card'} /></label>
      <label className="text-sm">Tipo<select className="mt-1 w-full rounded border border-white/15 bg-[#07101f] p-2" name="obligationType" defaultValue="other"><option value="other">Pago recurrente</option><option value="loan">Deuda</option><option value="insurance">Seguro</option><option value="service">Servicio</option></select></label>
      <label className="text-sm sm:col-span-2">Fecha efectiva del ciclo<input className="mt-1 w-full rounded border border-white/15 bg-[#07101f] p-2" name="effectiveDueDate" type="date" defaultValue={payment.effective_due_date || expectedDate} required /></label>
    </div>
    <div className="space-y-2"><label className="block text-sm">Buscar pago real<div className="mt-1 flex gap-2"><input autoComplete="off" className="min-w-0 flex-1 rounded border border-white/15 bg-[#07101f] p-2" name="legacyTransactionSearch" onChange={(event) => setCandidateSearch(event.target.value)} placeholder="Fecha, descripción, cuenta o importe" type="search" value={candidateSearch}/>{candidateSearch && <button className="rounded border border-white/15 px-3 py-2 text-sm" onClick={() => setCandidateSearch('')} type="button">Limpiar</button>}</div></label><p className="text-xs text-slate-400">Buscamos pagos confirmados y movimientos Plaid elegibles hasta {setup.searchWindowDays} días antes y después del vencimiento. {setup.candidates.length} candidatos están disponibles.</p></div>
    {visibleCandidates.usedExactAmountFallback && visibleCandidates.candidates.length > 0 && <p className="rounded border border-sky-700 bg-sky-950/30 p-3 text-sm text-sky-100">La búsqueda textual no coincidió. Mostramos {visibleCandidates.candidates.length} transacciones con el importe exacto para que puedas revisarlas.</p>}
    <label className="block text-sm">Transacción real pagada<select className="mt-1 w-full rounded border border-white/15 bg-[#07101f] p-2" name="candidateId" onChange={(event) => { setSelectedCandidateId(event.target.value); setConfirmedAmountDifference(false) }} value={selectedCandidateId} required><option value="" disabled>Selecciona un pago real</option>{visibleCandidates.candidates.map((candidate) => <option key={`${candidate.source}:${candidate.id}`} value={candidate.id}>{candidate.source === 'quick_entries' ? 'Confirmado' : 'Pendiente de confirmar'} · {candidate.entry_date} · {money(candidate.amount)} · {candidate.description}{candidate.exactAmount ? ' · importe exacto' : ' · importe diferente'}</option>)}</select></label>
    {selectedCandidate?.source === 'plaid_imports' && <p className="rounded border border-sky-700 bg-sky-950/30 p-3 text-sm text-sky-100"><strong>Pendiente de confirmar:</strong> este movimiento existe en Plaid, pero todavía no está en el ledger. Primero se confirmará mediante el flujo financiero existente; solo después podrá enlazarse y cerrarse esta instancia.</p>}
    {selectedCandidate && hasAmountDifference && <div className="space-y-2 rounded border border-amber-600 bg-amber-950/30 p-3 text-sm text-amber-100"><p><strong>Pago real {money(selectedCandidate.amount)}</strong> · {money(Math.abs(selectedAmountDifference))} {selectedAmountDifference > 0 ? 'más' : 'menos'} que lo esperado.</p>{selectedCandidate.amountBehavior === 'fixed' && <><p>La obligación usa un importe fijo de {money(configuredAmount)}.</p><p>Se requiere confirmación manual.</p></>}<label className="flex items-start gap-2"><input checked={confirmedAmountDifference} className="mt-1" onChange={(event) => setConfirmedAmountDifference(event.target.checked)} type="checkbox" /><span>Confirmo manualmente que este importe diferente corresponde al pago real. Esta diferencia nunca se reconcilia automáticamente.</span></label></div>}
    {setup.candidates.length === 0 && <p className="rounded border border-amber-800 p-3 text-sm text-amber-100">No encontramos transacciones confirmadas y disponibles dentro de {setup.searchWindowDays} días. Importa o confirma la transacción real antes de completar la migración.</p>}
    {setup.candidates.length > 0 && visibleCandidates.candidates.length === 0 && <p className="rounded border border-amber-800 p-3 text-sm text-amber-100">Ninguna transacción disponible coincide con la búsqueda. Limpia el filtro o prueba otra fecha, descripción, cuenta o importe.</p>}
    <p className="text-xs text-slate-400">No se inventará ninguna transacción. Un movimiento Plaid pendiente debe promoverse sin cambiar importe, fecha ni cuenta antes de quedar enlazado como evidencia permanente.</p>
    {error && <p className="rounded border border-red-800 p-3 text-red-100">{error}</p>}
    <button className="rounded border border-emerald-600 px-3 py-2 font-semibold text-emerald-100 disabled:opacity-50" disabled={saving || setup.candidates.length === 0 || (hasAmountDifference && !confirmedAmountDifference)} type="submit">{saving ? 'Guardando…' : selectedCandidate?.source === 'plaid_imports' ? 'Confirmar movimiento y conciliar' : 'Migrar y conciliar pago'}</button>
  </form>
}
