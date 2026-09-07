'use client'

import { useState } from 'react'
import type {
  LegacyObligationReview,
  LegacyReviewEvidence,
  LegacyReviewLocalPaymentDecision,
  LegacyReviewPaymentClassification,
} from '@/lib/financial-engine/legacy-obligation-review'
import { summarizeLegacyReviewDecisions } from '@/lib/financial-engine/legacy-obligation-review'

type ReimbursementDecision = string | 'unclassified'

const paymentClassificationLabels: Record<LegacyReviewPaymentClassification, string> = {
  current: 'Ciclo actual',
  previous: 'Período anterior / atraso',
  complement: 'Complemento/restante del ciclo',
  unclassified: 'Sin clasificar',
}

function money(value: number | null) {
  return `$${Math.abs(Number(value || 0)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function localDateTime(value: string | null) {
  if (!value) return 'Fecha no disponible'
  return new Intl.DateTimeFormat('es-PR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Puerto_Rico',
  }).format(new Date(value))
}

function localDate(value: string | null) {
  if (!value) return 'Fecha no disponible'
  return new Intl.DateTimeFormat('es-PR', {
    dateStyle: 'medium',
    timeZone: 'America/Puerto_Rico',
  }).format(new Date(value))
}

function amountDifference(actual: number | null, expected: number | null) {
  const difference = Math.abs(Number(actual || 0)) - Math.abs(Number(expected || 0))
  if (Math.abs(difference) < 0.01) return 'Coincide con el importe esperado.'
  return `${money(Math.abs(difference))} ${difference > 0 ? 'más' : 'menos'} que lo esperado.`
}

function EvidenceCandidates({ evidence }: { evidence: LegacyReviewEvidence }) {
  if (evidence.candidates.length === 0) {
    return (
      <p className="mt-3 rounded-lg border border-white/8 bg-black/10 p-3 text-sm text-slate-400">
        No hay candidatos Plaid almacenados para esta evidencia.
      </p>
    )
  }

  return (
    <details className="mt-3 rounded-xl border border-sky-300/15 bg-sky-400/[0.04] p-3" open={evidence.ambiguous}>
      <summary className="cursor-pointer text-sm font-semibold text-sky-200">
        Candidatos Plaid existentes ({evidence.candidates.length})
        {evidence.ambiguous ? ' · Ambiguo' : ''}
      </summary>
      <div className="mt-3 space-y-3">
        {evidence.candidates.map((candidate) => (
          <article className="rounded-lg border border-white/8 bg-[#07101f] p-3" key={candidate.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-white">
                  {candidate.merchant || 'Movimiento Plaid'}
                </p>
                <p className="text-xs text-slate-400">
                  {[candidate.transactionDate, candidate.institutionName, candidate.accountName]
                    .filter(Boolean)
                    .join(' · ') || 'Contexto no disponible'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-white">{money(candidate.amount)}</p>
                <p className="text-xs text-sky-300">
                  Score {candidate.score}/100 · rango {candidate.rank}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Estado: {candidate.status}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-300">
              {candidate.reasons.map((reason, index) => (
                <li key={`${candidate.id}-${reason.code}-${index}`}>
                  {reason.positive ? '✓' : '–'} {reason.message}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </details>
  )
}

export default function LegacyObligationReviewPreview({
  review,
}: {
  review: LegacyObligationReview
}) {
  const [paymentDecisions, setPaymentDecisions] = useState<Record<string, LegacyReviewLocalPaymentDecision>>({})
  const [reimbursementDecisions, setReimbursementDecisions] = useState<Record<string, ReimbursementDecision>>({})
  const expectedAmount = review.schedule.amount
  const decisionSummary = summarizeLegacyReviewDecisions(review, paymentDecisions)

  function classifyPayment(paymentId: string, classification: LegacyReviewPaymentClassification) {
    setPaymentDecisions((current) => ({
      ...current,
      [paymentId]: {
        classification,
        ...(classification === 'complement' && current[paymentId]?.complementsPaymentId
          ? { complementsPaymentId: current[paymentId].complementsPaymentId }
          : {}),
      },
    }))
  }

  function selectComplementTarget(paymentId: string, complementsPaymentId: string) {
    setPaymentDecisions((current) => ({
      ...current,
      [paymentId]: {
        classification: 'complement',
        ...(complementsPaymentId ? { complementsPaymentId } : {}),
      },
    }))
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Obligación</p>
            <p className="mt-1 text-xl font-semibold text-white">{review.schedule.name}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Responsable</p>
            <p className="mt-1 text-xl font-semibold text-white">{review.schedule.owner || 'Sin definir'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Esperado</p>
            <p className="mt-1 text-xl font-semibold text-white">{money(expectedAmount)}</p>
          </div>
        </div>
      </section>

      <section className={`rounded-2xl border p-4 text-sm ${review.ambiguous ? 'border-amber-300/20 bg-amber-400/[0.06] text-amber-100' : 'border-sky-300/15 bg-sky-400/[0.04] text-sky-100'}`}>
        <p className="font-semibold">
          {review.ambiguous
            ? 'Mansor One no puede determinar con seguridad qué pago corresponde a cada ciclo.'
            : 'Mansor One encontró una ruta plausible, pero esta vista no toma decisiones.'}
        </p>
        <p className="mt-1 opacity-80">
          Explora las opciones sin guardar. Ningún movimiento está seleccionado y estas decisiones desaparecen al salir o recargar.
        </p>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">Evidencia de pago</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Posibles pagos</h2>
        </div>
        {review.possiblePayments.map((payment, index) => {
          const label = String.fromCharCode(65 + index)
          return (
            <article className="rounded-2xl border border-white/8 bg-white/[0.035] p-5" key={payment.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Pago {label}</p>
                  <h3 className="mt-1 font-semibold text-white">
                    {payment.message || payment.subject || 'ATH Móvil'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {localDateTime(payment.occurred_at || payment.email_date)} · enviado a {payment.counterparty_name || 'contraparte no identificada'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-semibold text-white">{money(payment.amount)}</p>
                  <p className="text-sm text-amber-200">{amountDifference(payment.amount, expectedAmount)}</p>
                </div>
              </div>
              {payment.ambiguous && (
                <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-400/[0.06] p-3 text-sm text-amber-100">
                  Ambiguo: esta evidencia tiene múltiples candidatos Plaid o razones de ambigüedad almacenadas.
                </p>
              )}
              <fieldset className="mt-4">
                <legend className="text-sm font-semibold text-slate-200">Explorar clasificación local</legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  {([
                    ['current', 'Ciclo actual'],
                    ['previous', 'Período anterior / atraso'],
                    ['complement', 'Complemento/restante del ciclo'],
                    ['unclassified', 'Sin clasificar'],
                  ] as const).map(([value, text]) => (
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200" key={value}>
                      <input
                        checked={paymentDecisions[payment.id]?.classification === value}
                        name={`payment-${payment.id}`}
                        onChange={() => classifyPayment(payment.id, value)}
                        type="radio"
                      />
                      {text}
                    </label>
                  ))}
                </div>
                {paymentDecisions[payment.id]?.classification === 'complement' && (
                  <label className="mt-3 block max-w-xl text-sm text-slate-300">
                    Pago principal que complementa (opcional)
                    <select
                      className="mt-2 w-full rounded-lg border border-white/10 bg-[#07101f] px-3 py-2 text-white"
                      onChange={(event) => selectComplementTarget(payment.id, event.target.value)}
                      value={paymentDecisions[payment.id]?.complementsPaymentId || ''}
                    >
                      <option value="">No seleccionado</option>
                      {review.possiblePayments
                        .filter((candidate) => candidate.id !== payment.id)
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            Pago {String.fromCharCode(65 + review.possiblePayments.findIndex((item) => item.id === candidate.id))} · {money(candidate.amount)} · {localDate(candidate.occurred_at || candidate.email_date)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </fieldset>
              <EvidenceCandidates evidence={payment} />
            </article>
          )
        })}
        {review.possiblePayments.length === 0 && (
          <p className="rounded-2xl border border-white/8 p-5 text-slate-300">
            No se encontró evidencia ATH enviada con contexto suficiente dentro de la ventana revisada.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Liquidación entre miembros</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Posibles reimbursements posteriores</h2>
        </div>
        {review.possibleReimbursements.map((reimbursement) => (
          <article className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.035] p-5" key={reimbursement.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">
                  Recibido de {reimbursement.counterparty_name || 'contraparte no identificada'}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  {localDate(reimbursement.occurred_at || reimbursement.email_date)}
                  {reimbursement.message ? ` · ${reimbursement.message}` : ''}
                </p>
              </div>
              <p className="text-xl font-semibold text-emerald-200">{money(reimbursement.amount)}</p>
            </div>
            <fieldset className="mt-4">
              <legend className="text-sm font-semibold text-slate-200">Explorar relación local</legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {review.possiblePayments.map((payment, index) => (
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200" key={payment.id}>
                    <input
                      checked={reimbursementDecisions[reimbursement.id] === payment.id}
                      name={`reimbursement-${reimbursement.id}`}
                      onChange={() => setReimbursementDecisions((current) => ({ ...current, [reimbursement.id]: payment.id }))}
                      type="radio"
                    />
                    Corresponde al pago {String.fromCharCode(65 + index)}
                  </label>
                ))}
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200">
                  <input
                    checked={reimbursementDecisions[reimbursement.id] === 'unclassified'}
                    name={`reimbursement-${reimbursement.id}`}
                    onChange={() => setReimbursementDecisions((current) => ({ ...current, [reimbursement.id]: 'unclassified' }))}
                    type="radio"
                  />
                  Sin clasificar
                </label>
              </div>
            </fieldset>
            <EvidenceCandidates evidence={reimbursement} />
          </article>
        ))}
        {review.possibleReimbursements.length === 0 && (
          <p className="rounded-2xl border border-white/8 p-5 text-slate-300">
            No se encontró una transferencia ATH recibida posteriormente de la persona responsable.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-indigo-300/15 bg-indigo-400/[0.04] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">Vista previa de decisión</p>
        <h2 className="mt-1 text-xl font-semibold text-white">
          {review.schedule.name} · responsable {review.schedule.owner || 'sin definir'}
        </h2>
        <p className="mt-1 text-sm text-slate-400">Esperado legacy: {money(expectedAmount)}</p>

        {decisionSummary.selectedPayments.length > 0 ? (
          <div className="mt-4 space-y-3">
            {decisionSummary.selectedPayments.map(({ payment, decision }) => {
              const complementTarget = review.possiblePayments.find((item) =>
                item.id === decision.complementsPaymentId
              )
              return (
                <article className="rounded-xl border border-white/8 bg-black/10 p-3" key={payment.id}>
                  <p className="font-semibold text-white">
                    {money(payment.amount)} · {localDate(payment.occurred_at || payment.email_date)}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    Clasificación: {paymentClassificationLabels[decision.classification]}
                  </p>
                  {decision.classification === 'complement' && (
                    <p className="mt-1 text-sm text-slate-400">
                      Complementa: {complementTarget
                        ? `pago de ${money(complementTarget.amount)}`
                        : 'pago principal no seleccionado'}
                    </p>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-400">Todavía no has clasificado ningún pago.</p>
        )}

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/8 p-3">
            <dt className="text-sm text-slate-400">Total seleccionado para ciclo actual</dt>
            <dd className="mt-1 text-xl font-semibold text-white">{money(decisionSummary.currentCycleTotal)}</dd>
          </div>
          <div className="rounded-xl border border-white/8 p-3">
            <dt className="text-sm text-slate-400">Total clasificado como período anterior</dt>
            <dd className="mt-1 text-xl font-semibold text-white">{money(decisionSummary.previousPeriodTotal)}</dd>
          </div>
        </dl>

        {decisionSummary.currentCycleTotal > 0 && expectedAmount !== null &&
          Math.abs(decisionSummary.currentCycleTotal - Math.abs(Number(expectedAmount))) >= 0.01 && (
          <p className="mt-4 rounded-lg border border-amber-300/20 bg-amber-400/[0.06] p-3 text-sm text-amber-100">
            El importe configurado es una expectativa. La evidencia seleccionada indica un importe real diferente. No se modificará automáticamente el importe esperado.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-sky-300/15 bg-sky-400/[0.04] p-4 text-sm text-sky-100">
        <p className="font-semibold">Vista previa estrictamente read-only</p>
        <p className="mt-1 text-sky-100/80">
          No guarda decisiones, no promueve imports, no crea movimientos ni payment links y no modifica obligación, ATH o ledger.
        </p>
      </section>
    </div>
  )
}
