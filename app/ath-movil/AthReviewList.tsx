'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AthMatchReason } from '@/lib/ath-movil/types'

export type AthReviewCandidate = {
  id: string
  plaidImportId: string
  score: number
  rank: number
  status: string
  reviewedAt: string | null
  reasons: AthMatchReason[]
  plaid: {
    amount: number | null
    transactionDate: string | null
    merchant: string | null
    accountName: string | null
    accountMask: string | null
    institutionName: string | null
  } | null
}

export type AthReviewEmail = {
  id: string
  subject: string | null
  counterpartyName: string | null
  amount: number | null
  direction: string | null
  emailDate: string | null
  occurredAt: string | null
  message: string | null
  isIgnored: boolean | null
  state: 'ignored' | 'confirmed' | 'pending' | 'rejected' | 'superseded' | 'no-match'
  candidates: AthReviewCandidate[]
}

function money(value: number | null) {
  return value === null ? 'Monto no disponible' : `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico' }) : 'Fecha no disponible'
}

function directionLabel(value: string | null) {
  return value === 'sent' ? 'Enviado' : value === 'received' ? 'Recibido' : value === 'internal_transfer' ? 'Transferencia interna' : 'Dirección desconocida'
}

function candidateAccount(candidate: AthReviewCandidate) {
  if (!candidate.plaid) return 'Cuenta no disponible'
  const mask = candidate.plaid.accountMask ? `••••${candidate.plaid.accountMask}` : null
  return [candidate.plaid.institutionName, candidate.plaid.accountName, mask].filter(Boolean).join(' · ') || 'Cuenta no identificada'
}

function movementHref(candidate: AthReviewCandidate) {
  return `/lab/review-queue?tab=all&subset=transaction&transaction=${encodeURIComponent(candidate.plaidImportId)}#transaction-${candidate.plaidImportId}`
}

function statusLabel(email: AthReviewEmail, pendingCount: number) {
  if (email.state === 'ignored') return 'Ignorado · no financiero'
  if (email.state === 'confirmed') return 'Confirmado'
  if (email.state === 'rejected') return 'Rechazado'
  if (email.state === 'superseded') return 'Superseded'
  if (pendingCount > 1) return 'Ambiguo'
  if (email.state === 'pending') return 'Pendiente'
  return 'Sin coincidencia'
}

function CandidateDetails({ candidate, compact = false }: { candidate: AthReviewCandidate; compact?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-white">{candidate.plaid?.merchant || 'Descripción no disponible'}</p>
          <p className="text-sm text-slate-300">{candidate.plaid?.transactionDate || 'Fecha no disponible'} · hora no provista por Plaid</p>
          <p className="text-sm text-slate-300">{candidateAccount(candidate)}</p>
        </div>
        <div className="text-right"><p className="font-bold text-white">{money(candidate.plaid?.amount ?? null)}</p><p className="text-sm text-sky-300">Score {candidate.score}/100</p></div>
      </div>
      {!compact && <div className="mt-2 space-y-1 text-sm text-slate-300">{candidate.reasons.map((reason, index) => <p key={`${candidate.id}-${reason.code}-${index}`}>{reason.positive ? '✓' : '–'} {reason.message}</p>)}</div>}
    </div>
  )
}

export default function AthReviewList({ emails }: { emails: AthReviewEmail[] }) {
  const router = useRouter()
  const [isRefreshing, startTransition] = useTransition()
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, string>>({})

  async function decide(emailId: string, candidateId: string, action: 'confirm' | 'reject') {
    setPendingId(candidateId)
    setMessages((current) => ({ ...current, [emailId]: '' }))
    try {
      const response = await fetch(`/api/ath-movil/candidates/${candidateId}/decision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) setMessages((current) => ({ ...current, [emailId]: result.error || 'No se pudo guardar la decisión.' }))
      else {
        setMessages((current) => ({ ...current, [emailId]: action === 'confirm' ? 'Coincidencia confirmada.' : 'Coincidencia rechazada.' }))
        startTransition(() => router.refresh())
      }
    } catch {
      setMessages((current) => ({ ...current, [emailId]: 'No se pudo guardar la decisión.' }))
    } finally { setPendingId(null) }
  }

  return <section className="mt-5 space-y-4" aria-label="Revisión de evidencia ATH">
    {emails.map((email) => {
      const pending = email.candidates.filter((candidate) => candidate.status === 'suggested')
      const confirmed = email.candidates.find((candidate) => candidate.status === 'confirmed')
      const rejected = email.candidates.filter((candidate) => candidate.status === 'rejected')
      const ambiguous = pending.some((candidate) => candidate.reasons.some((reason) => reason.code === 'ambiguity' && !reason.positive))
      const historical = rejected[0] || email.candidates.find((candidate) => candidate.status === 'superseded') || null
      const primary = confirmed || (!ambiguous ? pending.find((candidate) => candidate.rank === 1) || null : null) || (pending.length === 0 ? historical : null)
      const selectedCandidate = pending.find((candidate) => candidate.id === selected[email.id]) || null
      const displayCandidate = primary || selectedCandidate
      return <article className="rounded-xl border border-slate-700 bg-[#0b1730] p-5" key={email.id}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-bold text-white">{email.counterpartyName || email.subject || 'ATH Móvil'}</h2><p className="text-sm text-slate-300">{dateTime(email.occurredAt || email.emailDate)} · {directionLabel(email.direction)}</p></div>
          <div className="text-right"><p className="text-xl font-bold text-white">{money(email.amount)}</p><span className="mt-1 inline-block rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-200">{statusLabel(email, pending.length)}</span></div>
        </div>
        {email.message && <p className="mt-3 text-sm text-slate-300"><span className="font-semibold text-slate-200">Mensaje:</span> {email.message}</p>}

        {displayCandidate && <div className="mt-4"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-sky-300">{confirmed ? 'Candidato confirmado' : ambiguous ? 'Candidato seleccionado' : 'Candidato Plaid principal'}</p><CandidateDetails candidate={displayCandidate} /></div>}
        {confirmed?.reviewedAt && <p className="mt-3 text-sm text-emerald-300">Decidido el {dateTime(confirmed.reviewedAt)}</p>}
        {email.state === 'no-match' && <p className="mt-4 rounded-lg border border-slate-600 p-3 font-semibold text-slate-100">Sin coincidencia</p>}
        {email.isIgnored && <p className="mt-4 rounded-lg border border-slate-600 p-3 font-semibold text-slate-100">Ignorado · notificación no financiera</p>}
        {email.state === 'rejected' && <p className="mt-4 text-sm text-rose-300">Rechazado · {rejected.length} pareja(s) descartada(s). Esta pareja no se regenerará al sincronizar o reprocesar.</p>}

        {ambiguous && <details className="mt-4 rounded-lg border border-amber-400/40 p-3" open>
          <summary className="cursor-pointer font-semibold text-amber-200">Ver alternativas ({pending.length})</summary>
          <p className="mt-2 text-sm text-slate-300">Selecciona explícitamente una alternativa antes de confirmar.</p>
          <div className="mt-3 space-y-3">{pending.map((candidate) => <label className="block cursor-pointer" key={candidate.id}><span className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><input checked={selected[email.id] === candidate.id} name={`candidate-${email.id}`} onChange={() => setSelected((current) => ({ ...current, [email.id]: candidate.id }))} type="radio" /> Seleccionar candidato #{candidate.rank}</span><CandidateDetails candidate={candidate} /></label>)}</div>
        </details>}
        {!ambiguous && pending.length === 1 && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-sky-200">Ver alternativas (0)</summary><p className="mt-2 text-sm text-slate-400">No hay alternativas adicionales.</p></details>}

        {displayCandidate && <div className="mt-4 flex flex-wrap gap-2">
          {pending.length > 0 && <>
            <button className="rounded bg-sky-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-50" disabled={isRefreshing || Boolean(pendingId) || !displayCandidate} onClick={() => displayCandidate && decide(email.id, displayCandidate.id, 'confirm')} type="button">Confirmar coincidencia</button>
            <button className="rounded border border-rose-400/60 px-3 py-2 text-sm font-semibold text-rose-100 disabled:opacity-50" disabled={isRefreshing || Boolean(pendingId) || !displayCandidate} onClick={() => displayCandidate && decide(email.id, displayCandidate.id, 'reject')} type="button">Rechazar</button>
          </>}
          <a className="rounded border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100" href={movementHref(displayCandidate)}>Ver movimiento</a>
        </div>}
        {messages[email.id] && <p className="mt-3 text-sm text-sky-200" role="status">{messages[email.id]}</p>}
      </article>
    })}
    {!emails.length && <p className="rounded-xl border border-slate-700 p-6 text-center text-slate-300">No hay correos en este filtro.</p>}
  </section>
}
