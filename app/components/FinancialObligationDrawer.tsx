'use client'

import { paymentStatusPresentation, type PaymentInstance } from '@/lib/financial-engine'
import type { PaymentAccountOption } from '@/lib/financial-engine/payment-account-options'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import ConfirmObligationPaid from './ConfirmObligationPaid'

type Details = {
  instance: Record<string, unknown>
  obligation: Record<string, unknown> | null
  provider: Record<string, unknown> | null
  schedule: Record<string, unknown> | null
  card: Record<string, unknown> | null
  loan: Record<string, unknown> | null
  linkedPlaidAccount: Record<string, unknown> | null
  paymentLinks: Array<Record<string, unknown>>
  reconciliationEvents: Array<Record<string, unknown>>
  paymentAccounts: PaymentAccountOption[]
  suggestedPaymentAccount: { id: string; reason: string } | null
  missingInformation: string[]
  lineage: Record<string, string | null>
  paymentState: {
    settlementState: 'pending_settlement' | null
    candidateState: 'possible_match' | null
    canEditReportedPayment: boolean
    submissionMethod: 'POST' | 'PATCH' | null
    source: 'pending_payment_link' | 'legacy_initiated_instance' | 'possible_match_instance' | null
    reportedPayment: {
      reportedAmount: number
      confirmedAt: string | null
      paymentMethod: string | null
      paymentAccountId: string | null
      paymentAccountSource: string | null
      note: string | null
    } | null
  }
}

function text(value: unknown, fallback = 'No configurado') {
  return value === null || value === undefined || value === '' ? fallback : String(value)
}

function money(value: unknown) {
  return `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function Field({ label, value, source }: { label: string; value: unknown; source?: string | null }) {
  const missing = value === null || value === undefined || value === ''
  return <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3"><p className="text-xs text-slate-400">{label}</p><p className={missing ? 'text-slate-400' : 'font-semibold text-white'}>{text(value)}</p>{source && <p className="mt-1 text-[11px] text-slate-500">Fuente: {source}</p>}</div>
}

export default function FinancialObligationDrawer({ payment, onClose }: { payment: PaymentInstance; onClose: () => void }) {
  const [details, setDetails] = useState<Details | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingCandidate, setSavingCandidate] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    if (!payment.obligationInstanceId) return
    fetch(`/api/obligations/${payment.obligationInstanceId}/details`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'No se pudieron cargar los detalles')
        setDetails(payload)
      }).catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message) })
    return () => controller.abort()
  }, [payment.obligationInstanceId])

  useEffect(() => {
    function close(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  const obligation = details?.obligation
  const instance = details?.instance
  const link = details?.paymentLinks?.[0]
  const pendingLink = details?.paymentLinks?.find((candidate) =>
    candidate.reconciliation_status === 'pending_settlement' && !candidate.plaid_import_id
  )
  const editablePayment = details?.paymentState.canEditReportedPayment
    ? details.paymentState.reportedPayment
    : null
  const detectedLinks = details?.paymentLinks?.filter((candidate) =>
    candidate.reconciliation_status === 'detected' && candidate.plaid_import_id
  ) || []
  const dueDate = instance?.effective_due_date || payment.due_date || payment.expected_date
  const grace = payment.grace_until || payment.grace_due_date
  const presentation = paymentStatusPresentation({
    status: payment.truthStatus || payment.lifecycleState || payment.status,
    lifecycleState: payment.lifecycleState,
    amount: payment.amount,
    dueDate: String(dueDate || ''),
    graceDate: grace,
    evidenceDate: payment.lifecycleMatchedTransaction?.date || payment.updated_at,
    reconciledDate: String(link?.reconciled_at || ''),
    confidence: payment.lifecycleMatchedTransaction?.confidence,
  })

  async function decideCandidate(paymentLinkId: string, action: 'reject' | 'confirm') {
    setSavingCandidate(paymentLinkId)
    setError(null)
    const response = await fetch('/api/obligations/reconciliation-candidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paymentLinkId, action }),
    })
    const payload = await response.json()
    setSavingCandidate(null)
    if (!response.ok) {
      setError(payload.error || 'No se pudo guardar la decisión')
      return
    }
    setDetails((current) => current ? {
      ...current,
      paymentLinks: current.paymentLinks.map((candidate) =>
        candidate.id === paymentLinkId
          ? { ...candidate, reconciliation_status: payload.status }
          : candidate
      ),
    } : current)
  }

  return <div className="fixed inset-0 z-50 flex justify-end bg-black/65" role="dialog" aria-modal="true" aria-label={`Detalles de ${payment.name || 'obligación'}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#08101f] p-5 shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-3"><div><p className="text-sm text-indigo-200">Obligación financiera</p><h2 className="text-2xl font-bold">{payment.name || 'Pago'}</h2><span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${presentation.classes}`}><span aria-hidden="true">{presentation.icon}</span>&nbsp;{presentation.label}</span><p className="mt-2 max-w-xl text-sm text-slate-300">{presentation.explanation}</p>{presentation.relativeLabel && <p className="mt-1 text-sm font-semibold text-white">{presentation.relativeLabel}</p>}{presentation.confidence !== null && <p className="mt-1 text-sm font-semibold">Confianza {presentation.confidence}% · {presentation.confidenceStrength}</p>}</div><button className="rounded-lg border border-white/10 px-3 py-2" onClick={onClose}>Cerrar</button></div>
      {error && <p className="mt-5 rounded border border-red-800 bg-red-950/30 p-3 text-red-100">{error}</p>}
      {!payment.obligationInstanceId && <div className="mt-6 space-y-4"><p className="rounded border border-amber-900/60 bg-amber-950/20 p-3 text-amber-100">Este pago proviene de un calendario anterior que todavía no tiene una instancia de obligación enlazada. Su historial no se modificó.</p><div className="grid gap-2 sm:grid-cols-2"><Field label="Importe" value={Number(payment.amount || 0) > 0 ? money(payment.amount) : 'Monto no configurado'}/><Field label="Vencimiento contractual" value={payment.due_date || payment.expected_date}/><Field label="Fecha límite de gracia" value={payment.grace_until || payment.grace_due_date}/><Field label="Responsable" value={payment.owner}/></div><Link className="inline-flex rounded border px-3 py-2" href="/repair-center">Configurar obligación</Link></div>}
      {payment.obligationInstanceId && !details && !error && <p className="mt-5 text-slate-400">Cargando detalles…</p>}
      {details && <div className="mt-6 space-y-6">
        <section><h3 className="mb-3 font-bold">Resumen</h3><div className="grid gap-2 sm:grid-cols-2"><Field label="Importe" value={Number(instance?.amount_expected || payment.amount || 0) > 0 ? money(instance?.amount_expected || payment.amount) : 'Monto no configurado'} source={details.lineage.amount}/><Field label="Tipo" value={obligation?.obligation_type}/><Field label="Responsable" value={obligation?.owner || payment.owner}/><Field label="Frecuencia" value={obligation?.frequency}/><Field label="Institución o proveedor" value={details.provider?.provider_name || details.card?.bank || details.loan?.lender}/><Field label="Saldo actual" value={details.linkedPlaidAccount?.current_balance ? money(details.linkedPlaidAccount.current_balance) : details.loan?.balance ? money(details.loan.balance) : null} source={details.lineage.balance}/></div></section>
        <section><h3 className="mb-3 font-bold">Fechas importantes</h3><div className="grid gap-2 sm:grid-cols-2"><Field label="Vencimiento contractual" value={dueDate} source={details.lineage.dueDate}/><Field label="Fecha límite de gracia" value={grace} source={details.lineage.graceDeadline}/><Field label="Fecha usada por Salud Financiera y Flujo de Caja" value={grace || dueDate} source={grace ? 'Límite de gracia' : 'Vencimiento contractual'}/><Field label="Pago real" value={link?.confirmed_at}/><Field label="Última conciliación" value={link?.reconciled_at}/></div></section>
        {(details.card || details.loan) && <section><h3 className="mb-3 font-bold">Tarjeta o préstamo</h3><div className="grid gap-2 sm:grid-cols-2"><Field label="APR" value={details.card?.regular_apr || details.loan?.apr}/><Field label="Pago mínimo" value={details.linkedPlaidAccount?.plaid_minimum_payment_amount ? money(details.linkedPlaidAccount.plaid_minimum_payment_amount) : details.card?.minimum_payment ? money(details.card.minimum_payment) : details.loan?.monthly_payment ? money(details.loan.monthly_payment) : null}/><Field label="Límite de crédito" value={details.card?.credit_limit ? money(details.card.credit_limit) : null}/><Field label="Crédito disponible" value={details.linkedPlaidAccount?.available_balance ? money(details.linkedPlaidAccount.available_balance) : null}/><Field label="Terminación" value={details.card?.manual_last4}/><Field label="Pago automático" value={details.card?.autopay_enabled === true ? 'Activo' : details.card?.autopay_enabled === false ? 'No activo' : null}/></div></section>}
        <section><h3 className="mb-3 font-bold">Información pendiente</h3>{details.missingInformation.length ? <div className="space-y-2">{details.missingInformation.map((item) => <div className="flex items-center justify-between rounded-lg border border-amber-900/60 bg-amber-950/20 p-3" key={item}><span><strong>{item}</strong><span className="ml-2 text-slate-400">No configurado</span></span><Link className="text-indigo-200 underline" href={item === 'Monto' ? '/repair-center' : details.card ? '/cards' : '/portfolio'}>Configurar</Link></div>)}</div> : <p className="text-sm text-slate-400">La información principal está completa.</p>}</section>
        {editablePayment && <section><h3 className="font-bold">Pago reportado</h3><p className="text-sm text-slate-400">Puedes corregir el importe, fecha, cuenta, método o nota mientras esperamos evidencia bancaria.</p><ConfirmObligationPaid obligationInstanceId={payment.obligationInstanceId!} amount={editablePayment.reportedAmount} defaultPaymentMethod={payment.paymentMethod} paymentAccounts={details.paymentAccounts} suggestedAccount={details.suggestedPaymentAccount} submissionMethod={details.paymentState.submissionMethod || undefined} existingPayment={editablePayment}/></section>}
        {payment.obligationInstanceId && !editablePayment && !['paid', 'matched', 'in_transit'].includes(payment.truthStatus || '') && <section><h3 className="font-bold">Confirmar pago</h3><ConfirmObligationPaid obligationInstanceId={payment.obligationInstanceId} amount={Number(instance?.amount_expected || payment.amount || 0)} defaultPaymentMethod={payment.paymentMethod} paymentAccounts={details.paymentAccounts} suggestedAccount={details.suggestedPaymentAccount}/></section>}
        {detectedLinks.length > 0 && <section><h3 className="mb-3 font-bold">Evidencia candidata</h3><div className="space-y-3">{detectedLinks.map((candidate) => {
          const importedValue = candidate.plaid_imports
          const imported = Array.isArray(importedValue) ? importedValue[0] : importedValue as Record<string, unknown> | null
          const expectedAmount = Number(pendingLink?.reported_amount || instance?.amount_expected || payment.amount || 0)
          const candidateAmount = Math.abs(Number(imported?.amount || 0))
          const exactAmount = expectedAmount > 0 && Math.abs(candidateAmount - expectedAmount) <= 0.009
          return <div className="rounded border border-sky-900 bg-sky-950/20 p-3 text-sm" key={String(candidate.id)}><div className="flex justify-between gap-2"><strong>{text(imported?.merchant, 'Transacción')}</strong><strong>{money(candidateAmount)}</strong></div><p className="text-slate-300">{text(imported?.transaction_date, 'Sin fecha')} · {text(imported?.institution_name, '')} {text(imported?.account_name, '')}</p><p className={exactAmount ? 'text-emerald-200' : 'text-amber-200'}>{exactAmount ? 'El importe coincide exactamente.' : `No elegible: se esperaban ${money(expectedAmount)}.`}</p><div className="mt-2 flex flex-wrap gap-2"><button className="rounded border px-3 py-2" disabled={savingCandidate === candidate.id} onClick={() => decideCandidate(String(candidate.id), 'reject')}>No corresponde a este pago</button>{exactAmount && <button className="rounded border border-emerald-500 px-3 py-2 font-semibold text-emerald-100" disabled={savingCandidate === candidate.id} onClick={() => decideCandidate(String(candidate.id), 'confirm')}>Confirmar esta transacción</button>}</div></div>
        })}</div></section>}
        <section className="flex flex-wrap gap-2">{Boolean(details.card?.id) && <Link className="rounded border px-3 py-2" href="/cards">Ver tarjeta</Link>}{Boolean(details.loan?.id) && <Link className="rounded border px-3 py-2" href="/portfolio">Ver préstamo</Link>}{Boolean(details.linkedPlaidAccount?.id) && <Link className="rounded border px-3 py-2" href="/portfolio#plaid-accounts">Ver cuenta</Link>}<Link className="rounded border px-3 py-2" href="/timeline#payments">Ver historial de pagos</Link></section>
        <details className="rounded border border-white/10 p-3"><summary className="cursor-pointer font-semibold">Ver detalles técnicos</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-slate-400">{JSON.stringify({ lineage: details.lineage, paymentLinks: details.paymentLinks, reconciliationEvents: details.reconciliationEvents }, null, 2)}</pre></details>
      </div>}
    </aside>
  </div>
}
