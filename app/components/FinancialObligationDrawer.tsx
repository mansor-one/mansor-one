'use client'

import type { PaymentInstance } from '@/lib/financial-engine'
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
}

const status: Record<string, string> = {
  scheduled: 'Programado', future: 'Programado', unpaid: 'Programado', due_soon: 'Próximo a vencer',
  due_today: 'Próximo a vencer', overdue: 'Vencido', payment_detected: 'Pago detectado',
  possible_match: 'Pago detectado', pending_settlement: 'Pagado, esperando confirmación',
  in_transit: 'Pagado, esperando confirmación', reconciled: 'Conciliado', matched: 'Conciliado',
  paid: 'Conciliado', cancelled: 'Cancelado', grace_period: 'En período de gracia',
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

  const lifecycle = status[payment.lifecycleState || ''] || status[payment.truthStatus || ''] || 'Programado'
  const obligation = details?.obligation
  const instance = details?.instance
  const link = details?.paymentLinks?.[0]
  const dueDate = instance?.effective_due_date || payment.due_date || payment.expected_date
  const grace = payment.grace_until || payment.grace_due_date

  return <div className="fixed inset-0 z-50 flex justify-end bg-black/65" role="dialog" aria-modal="true" aria-label={`Detalles de ${payment.name || 'obligación'}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#08101f] p-5 shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-3"><div><p className="text-sm text-indigo-200">Obligación financiera</p><h2 className="text-2xl font-bold">{payment.name || 'Pago'}</h2><span className="mt-2 inline-flex rounded-full border border-white/15 px-2 py-1 text-xs">{lifecycle}</span></div><button className="rounded-lg border border-white/10 px-3 py-2" onClick={onClose}>Cerrar</button></div>
      {error && <p className="mt-5 rounded border border-red-800 bg-red-950/30 p-3 text-red-100">{error}</p>}
      {!payment.obligationInstanceId && <div className="mt-6 space-y-4"><p className="rounded border border-amber-900/60 bg-amber-950/20 p-3 text-amber-100">Este pago proviene de un calendario anterior que todavía no tiene una instancia de obligación enlazada. Su historial no se modificó.</p><div className="grid gap-2 sm:grid-cols-2"><Field label="Importe" value={money(payment.amount)}/><Field label="Vencimiento contractual" value={payment.due_date || payment.expected_date}/><Field label="Fecha límite de gracia" value={payment.grace_until || payment.grace_due_date}/><Field label="Responsable" value={payment.owner}/></div><Link className="inline-flex rounded border px-3 py-2" href="/repair-center">Completar relación</Link></div>}
      {payment.obligationInstanceId && !details && !error && <p className="mt-5 text-slate-400">Cargando detalles…</p>}
      {details && <div className="mt-6 space-y-6">
        <section><h3 className="mb-3 font-bold">Resumen</h3><div className="grid gap-2 sm:grid-cols-2"><Field label="Importe" value={money(instance?.amount_expected || payment.amount)} source={details.lineage.amount}/><Field label="Tipo" value={obligation?.obligation_type}/><Field label="Responsable" value={obligation?.owner || payment.owner}/><Field label="Frecuencia" value={obligation?.frequency}/><Field label="Institución o proveedor" value={details.provider?.provider_name || details.card?.bank || details.loan?.lender}/><Field label="Saldo actual" value={details.linkedPlaidAccount?.current_balance ? money(details.linkedPlaidAccount.current_balance) : details.loan?.balance ? money(details.loan.balance) : null} source={details.lineage.balance}/></div></section>
        <section><h3 className="mb-3 font-bold">Fechas importantes</h3><div className="grid gap-2 sm:grid-cols-2"><Field label="Vencimiento contractual" value={dueDate} source={details.lineage.dueDate}/><Field label="Fecha límite de gracia" value={grace} source={details.lineage.graceDeadline}/><Field label="Fecha usada por Salud Financiera y Flujo de Caja" value={grace || dueDate} source={grace ? 'Límite de gracia' : 'Vencimiento contractual'}/><Field label="Pago real" value={link?.confirmed_at}/><Field label="Última conciliación" value={link?.reconciled_at}/></div></section>
        {(details.card || details.loan) && <section><h3 className="mb-3 font-bold">Tarjeta o préstamo</h3><div className="grid gap-2 sm:grid-cols-2"><Field label="APR" value={details.card?.regular_apr || details.loan?.apr}/><Field label="Pago mínimo" value={details.linkedPlaidAccount?.plaid_minimum_payment_amount ? money(details.linkedPlaidAccount.plaid_minimum_payment_amount) : details.card?.minimum_payment ? money(details.card.minimum_payment) : details.loan?.monthly_payment ? money(details.loan.monthly_payment) : null}/><Field label="Límite de crédito" value={details.card?.credit_limit ? money(details.card.credit_limit) : null}/><Field label="Crédito disponible" value={details.linkedPlaidAccount?.available_balance ? money(details.linkedPlaidAccount.available_balance) : null}/><Field label="Terminación" value={details.card?.manual_last4}/><Field label="Pago automático" value={details.card?.autopay_enabled === true ? 'Activo' : details.card?.autopay_enabled === false ? 'No activo' : null}/></div></section>}
        <section><h3 className="mb-3 font-bold">Información pendiente</h3>{details.missingInformation.length ? <div className="space-y-2">{details.missingInformation.map((item) => <div className="flex items-center justify-between rounded-lg border border-amber-900/60 bg-amber-950/20 p-3" key={item}><span><strong>{item}</strong><span className="ml-2 text-slate-400">No configurado</span></span><Link className="text-indigo-200 underline" href={details.card ? '/cards' : '/portfolio'}>Agregar</Link></div>)}</div> : <p className="text-sm text-slate-400">La información principal está completa.</p>}</section>
        {payment.obligationInstanceId && !['paid', 'matched', 'in_transit'].includes(payment.truthStatus || '') && <section><h3 className="font-bold">Confirmar pago</h3><ConfirmObligationPaid obligationInstanceId={payment.obligationInstanceId} defaultPaymentMethod={payment.paymentMethod} paymentAccounts={details.paymentAccounts} suggestedAccount={details.suggestedPaymentAccount}/></section>}
        <section className="flex flex-wrap gap-2">{Boolean(details.card?.id) && <Link className="rounded border px-3 py-2" href="/cards">Ver tarjeta</Link>}{Boolean(details.loan?.id) && <Link className="rounded border px-3 py-2" href="/portfolio">Ver préstamo</Link>}{Boolean(details.linkedPlaidAccount?.id) && <Link className="rounded border px-3 py-2" href="/portfolio#plaid-accounts">Ver cuenta</Link>}<Link className="rounded border px-3 py-2" href="/timeline#payments">Ver historial de pagos</Link></section>
        <details className="rounded border border-white/10 p-3"><summary className="cursor-pointer font-semibold">Ver detalles técnicos</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-slate-400">{JSON.stringify({ lineage: details.lineage, paymentLinks: details.paymentLinks, reconciliationEvents: details.reconciliationEvents }, null, 2)}</pre></details>
      </div>}
    </aside>
  </div>
}
