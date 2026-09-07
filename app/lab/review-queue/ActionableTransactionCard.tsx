'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ReviewQueueCandidate } from '@/lib/financial-engine'
import MerchantLogo from '@/app/components/MerchantLogo'

type Option = { value: string; label: string }
type PlanningFundOption = { id: string; name: string }

const transactionTypes = [
  ['regular_expense', 'Regular expense'],
  ['goal_event', 'Goal or family event'],
  ['debt_payment', 'Debt payment'],
  ['transfer', 'Transfer'],
  ['non_spending', 'Non-spending'],
  ['ignore', 'Ignore'],
] as const

function money(value: number) {
  return `$${Math.abs(Number(value || 0)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function metadataText(candidate: ReviewQueueCandidate, key: string) {
  const value = candidate.transaction.metadata[key]
  return typeof value === 'string' && value ? value : null
}

function accountLabel(candidate: ReviewQueueCandidate) {
  const institution = metadataText(candidate, 'institutionName')
  const account = metadataText(candidate, 'accountName')
  const mask = metadataText(candidate, 'accountMask')
  return [institution, account, mask ? `••••${mask}` : null].filter(Boolean).join(' · ') || 'Account not identified'
}

function evidenceStrength(score: number) {
  if (score >= 85) return 'Coincidencia fuerte'
  if (score >= 70) return 'Coincidencia posible'
  return 'Alternativa débil'
}

function redactedReference(value: string | null) {
  return value ? `••••${value.slice(-4)}` : null
}

export function ActionableTransactionCard({
  candidate,
  categories,
  planningFunds,
  owners,
  onReviewLater,
}: {
  candidate: ReviewQueueCandidate
  categories: Option[]
  planningFunds: PlanningFundOption[]
  owners: string[]
  onReviewLater: () => void
}) {
  const router = useRouter()
  const [isRefreshing, startTransition] = useTransition()
  const suggestedCategory = candidate.canonicalCategory?.displayName || candidate.suggestedCategory || ''
  const [transactionType, setTransactionType] = useState('regular_expense')
  const [category, setCategory] = useState(suggestedCategory)
  const [selectedContextCategoryCode, setSelectedContextCategoryCode] = useState('')
  const [planningItemId, setPlanningItemId] = useState('')
  const [owner, setOwner] = useState('')
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [evidenceMessage, setEvidenceMessage] = useState('')
  const [evidencePending, setEvidencePending] = useState(false)
  const disabled = isSaving || isRefreshing
  const evidence = candidate.athEvidence.find((item) => item.status === 'confirmed') || candidate.athEvidence.find((item) => item.status === 'suggested') || candidate.athEvidence.find((item) => item.status === 'rejected') || candidate.athEvidence.find((item) => item.status === 'superseded')
  const alternatives = candidate.athEvidence.filter((item) => item.emailId !== evidence?.emailId && item.status === 'suggested')
  const transactionContext = candidate.transactionContext
  const selectedContextSuggestion = transactionContext?.suggestions.find((item) =>
    item.categoryCode === selectedContextCategoryCode
  ) || (transactionContext?.ambiguous ? null : transactionContext?.suggestions[0] || null)

  function contextConfidenceLabel(value: number) {
    if (value >= 0.8) return 'Alta'
    if (value >= 0.55) return 'Media'
    return 'Baja'
  }

  function useContextSuggestion() {
    if (!selectedContextSuggestion) return
    setCategory(selectedContextSuggestion.displayName)
  }

  async function decideEvidence(candidateId: string, action: 'confirm' | 'reject') {
    setEvidencePending(true)
    setEvidenceMessage('')
    try {
      const response = await fetch(`/api/ath-movil/candidates/${candidateId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const result = await response.json()
      if (!response.ok) setEvidenceMessage(result.error || 'No se pudo guardar la decisión.')
      else {
        setEvidenceMessage(action === 'confirm' ? 'Contexto ATH confirmado.' : 'Sugerencia rechazada.')
        startTransition(() => router.refresh())
      }
    } catch {
      setEvidenceMessage('No se pudo guardar la decisión.')
    } finally {
      setEvidencePending(false)
    }
  }

  async function saveDecision() {
    setIsSaving(true)
    setMessage('')

    try {
      const response = await fetch('/api/review-queue/decide-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plaidImportId: candidate.transaction.id,
          transactionType,
          category,
          planningItemId: transactionType === 'goal_event' ? planningItemId : null,
          owner: owner || null,
          note: note || null,
        }),
      })
      const result = await response.json()

      if (!response.ok || result.error) {
        setMessage(result.error || 'Could not save this transaction.')
        return
      }

      setMessage(transactionType === 'ignore' ? 'Transaction ignored.' : 'Transaction saved.')
      startTransition(() => router.refresh())
    } catch {
      setMessage('Could not save this transaction.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <article className="space-y-5 rounded-xl border bg-white p-5 text-slate-950 shadow-sm dark:bg-slate-950 dark:text-slate-50" id={`transaction-${candidate.transaction.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <MerchantLogo
            merchant={candidate.merchant}
            plaidImportId={
              candidate.transaction.metadata.merchantEntityId &&
              candidate.transaction.metadata.merchantLogoUrl
                ? candidate.sourceTable === 'plaid_imports'
                  ? candidate.transaction.id
                  : (candidate.transaction.metadata.plaidImportId as string | null)
                : null
            }
          />
          <div>
          <h2 className="text-2xl font-bold">{candidate.merchant || candidate.transaction.description || 'Transaction'}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {candidate.transaction.date || 'Date unavailable'} · {accountLabel(candidate)}
          </p>
          </div>
        </div>
        <p className="text-2xl font-bold">{money(candidate.transaction.amount)}</p>
      </div>

      <div className="space-y-4">
        {transactionContext && (
          <section className="rounded-xl border border-violet-400/40 bg-violet-950/30 p-4 text-slate-100" aria-label="Inteligencia de categorización ATH">
            <p className="text-xs font-bold uppercase tracking-wide text-violet-300">Contexto ATH</p>
            <p className="mt-1 font-semibold">{transactionContext.evidence.counterparty || 'ATH Móvil'}{transactionContext.evidence.message ? ` · “${transactionContext.evidence.message}”` : ''}</p>
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-violet-300">Robototina sugiere</p>
              {transactionContext.suggestions.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {transactionContext.suggestions.map((suggestion) => (
                    <label className={`block rounded-lg border p-3 ${transactionContext.ambiguous ? 'cursor-pointer' : ''}`} key={suggestion.id}>
                      <span className="flex items-center gap-2 font-bold">
                        {transactionContext.ambiguous && <input checked={selectedContextCategoryCode === suggestion.categoryCode} name={`context-category-${candidate.transaction.id}`} onChange={() => setSelectedContextCategoryCode(suggestion.categoryCode)} type="radio" />}
                        {suggestion.displayName}
                      </span>
                      <span className="mt-1 block text-sm text-slate-300">Confianza: {contextConfidenceLabel(suggestion.confidence)}</span>
                    </label>
                  ))}
                </div>
              ) : <p className="mt-2 text-sm text-slate-300">El contexto es útil, pero no hay una categoría suficientemente defendible.</p>}
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {transactionContext.relatedPersonName && <div><dt className="text-slate-400">Relacionado con</dt><dd>{transactionContext.relatedPersonName}</dd></div>}
              {transactionContext.purpose && <div><dt className="text-slate-400">Propósito</dt><dd>{transactionContext.purpose}</dd></div>}
              <div><dt className="text-slate-400">Confianza contextual</dt><dd>{contextConfidenceLabel(transactionContext.confidence)}</dd></div>
            </dl>
            <div className="mt-3 space-y-1 text-sm"><p className="font-semibold">Porque</p>{transactionContext.reasons.map((reason, index) => <p key={`${reason.code}-${index}`}>• {reason.message}</p>)}</div>
            {transactionContext.ambiguous && <p className="mt-3 text-sm text-amber-200">Hay múltiples conceptos. Selecciona una categoría explícitamente.</p>}
            {candidate.transactionContextMatchesCurrentCategory ? (
              <p className="mt-3 text-sm text-emerald-300">La sugerencia coincide con la categoría actual; no requiere otra acción.</p>
            ) : transactionContext.suggestions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded bg-violet-300 px-3 py-2 text-sm font-bold text-violet-950 disabled:opacity-50" disabled={!selectedContextSuggestion} onClick={useContextSuggestion} type="button">Usar sugerencia</button>
                <button className="rounded border border-slate-500 px-3 py-2 text-sm" onClick={() => setCategory('')} type="button">Cambiar categoría</button>
              </div>
            )}
            <p className="mt-3 text-xs text-slate-400">Elegir aquí solo preselecciona el formulario financiero. No escribe al ledger.</p>
          </section>
        )}
        {evidence && (
          <section className="rounded-xl border border-sky-500/40 bg-sky-950/30 p-4 text-slate-100" aria-label="Contexto ATH Móvil">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-sky-300">Contexto ATH Móvil</p>
                <h3 className="mt-1 font-bold">{evidence.status === 'confirmed' ? 'Evidencia confirmada' : evidence.status === 'rejected' ? 'Coincidencia rechazada' : evidence.status === 'superseded' ? 'Alternativa descartada' : 'Posible contexto de ATH Móvil'}</h3>
              </div>
              <span className="rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1 text-sm font-semibold">
                {evidence.score}/100 · {evidenceStrength(evidence.score)}
              </span>
            </div>
            <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-400">Persona</dt><dd>{evidence.counterpartyName || 'No identificada'}</dd></div>
              <div><dt className="text-slate-400">Fecha ATH</dt><dd>{evidence.occurredAt ? new Date(evidence.occurredAt).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico' }) : 'No disponible'}</dd></div>
              {evidence.counterpartyPhoneLast4 && <div><dt className="text-slate-400">Teléfono</dt><dd>•••• {evidence.counterpartyPhoneLast4}</dd></div>}
              {evidence.reference && <div><dt className="text-slate-400">Referencia</dt><dd>{redactedReference(evidence.reference)}</dd></div>}
              {evidence.message && <div className="sm:col-span-2"><dt className="text-slate-400">Mensaje</dt><dd>{evidence.message}</dd></div>}
            </dl>
            <div className="mt-3 space-y-1 text-sm">
              <p className="font-semibold">Por qué coincide</p>
              {evidence.reasons.map((reason) => <p key={reason.code}>{reason.positive ? '✓' : '–'} {reason.message}</p>)}
            </div>
            {evidence.status === 'suggested' && !transactionContext && (
              <>
                <p className="mt-3 text-xs text-sky-100">Esto añadirá contexto ATH a la transacción Plaid. No creará ni modificará movimientos financieros.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="rounded bg-sky-500 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-60" disabled={evidencePending} onClick={() => decideEvidence(evidence.candidateId, 'confirm')} type="button">Confirmar relación</button>
                  <button className="rounded border border-slate-500 px-3 py-2 text-sm disabled:opacity-60" disabled={evidencePending} onClick={() => decideEvidence(evidence.candidateId, 'reject')} type="button">No corresponde</button>
                </div>
              </>
            )}
            {alternatives.length > 0 && <details className="mt-3 rounded border border-slate-700 p-3"><summary className="cursor-pointer font-semibold">Ver alternativas ({alternatives.length})</summary><div className="mt-2 space-y-3">{alternatives.map((item) => <div className="rounded bg-slate-900/60 p-2" key={item.candidateId}><p className="font-semibold">{item.score}/100 · {item.counterpartyName || 'ATH Móvil'}</p><p className="text-xs text-slate-300">{item.occurredAt ? new Date(item.occurredAt).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico' }) : 'Fecha no disponible'}</p><button className="mt-2 rounded border px-2 py-1 text-xs" disabled={evidencePending} onClick={() => decideEvidence(item.candidateId, 'confirm')} type="button">Confirmar esta alternativa</button></div>)}</div></details>}
            {evidenceMessage && <p className="mt-3 text-sm" role="status">{evidenceMessage}</p>}
          </section>
        )}
        <label className="block space-y-1 font-semibold">
          <span>What does this transaction represent?</span>
          <select className="w-full rounded border p-3 font-normal" disabled={disabled} onChange={(event) => setTransactionType(event.target.value)} value={transactionType}>
            {transactionTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        {transactionType !== 'ignore' && (
          <label className="block space-y-1 font-semibold">
            <span>Spending category</span>
            <select className="w-full rounded border p-3 font-normal" disabled={disabled} onChange={(event) => setCategory(event.target.value)} value={category}>
              <option value="">Choose a category</option>
              {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        )}

        {transactionType === 'goal_event' && (
          <label className="block space-y-1 font-semibold">
            <span>Goal or planning fund</span>
            <select className="w-full rounded border p-3 font-normal" disabled={disabled} onChange={(event) => setPlanningItemId(event.target.value)} value={planningItemId}>
              <option value="">Choose a goal or fund</option>
              {planningFunds.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <span className="block text-xs font-normal text-slate-500">The spending category remains separate from this association.</span>
          </label>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-1 font-semibold">
            <span>Household owner <span className="font-normal text-slate-500">(optional)</span></span>
            <select className="w-full rounded border p-3 font-normal" disabled={disabled} onChange={(event) => setOwner(event.target.value)} value={owner}>
              <option value="">Household</option>
              {owners.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="block space-y-1 font-semibold">
            <span>Note <span className="font-normal text-slate-500">(optional)</span></span>
            <input className="w-full rounded border p-3 font-normal" disabled={disabled} onChange={(event) => setNote(event.target.value)} value={note} />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="rounded bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-60 dark:bg-white dark:text-slate-950" disabled={disabled} onClick={saveDecision} type="button">Save transaction</button>
        <button className="rounded border px-4 py-3" disabled={disabled} onClick={onReviewLater} type="button">Review later</button>
        {message && <p className="text-sm" role="status">{message}</p>}
      </div>

      <details className="rounded border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">View technical details</summary>
        <div className="mt-3 space-y-1 text-slate-600 dark:text-slate-300">
          <p>Source: {candidate.sourceTable}</p>
          <p>Source transaction ID: {candidate.transaction.plaidTransactionId || candidate.transaction.id}</p>
          <p>Review bucket: {candidate.classification}</p>
          {candidate.reasons.map((reason) => <p key={reason}>{reason}</p>)}
        </div>
      </details>
    </article>
  )
}
