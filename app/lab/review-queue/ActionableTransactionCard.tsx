'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ReviewQueueCandidate } from '@/lib/financial-engine'

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
  const [planningItemId, setPlanningItemId] = useState('')
  const [owner, setOwner] = useState('')
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const disabled = isSaving || isRefreshing

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
        <div>
          <h2 className="text-2xl font-bold">{candidate.merchant || candidate.transaction.description || 'Transaction'}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {candidate.transaction.date || 'Date unavailable'} · {accountLabel(candidate)}
          </p>
        </div>
        <p className="text-2xl font-bold">{money(candidate.transaction.amount)}</p>
      </div>

      <div className="space-y-4">
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
