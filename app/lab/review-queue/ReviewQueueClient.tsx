'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ReviewQueueCandidateActions } from './ReviewQueueCandidateActions'
import { ActionableTransactionCard } from './ActionableTransactionCard'
import type {
  LedgerSummaryTransaction,
  ReviewQueueCandidate,
} from '@/lib/financial-engine'
import type { ReviewQueueCounts } from '@/lib/financial-engine/review-queue-pagination'

type CategoryOption = {
  value: string
  label: string
  kind?: string
}

type ReviewQueueClientProps = {
  candidates: ReviewQueueCandidate[]
  readyToConfirm: ReviewQueueCandidate[]
  needsCategory: ReviewQueueCandidate[]
  possibleDuplicate: ReviewQueueCandidate[]
  athReview: ReviewQueueCandidate[]
  paymentConfirmation: ReviewQueueCandidate[]
  needsManualReview: ReviewQueueCandidate[]
  categoryOptions: CategoryOption[]
  initialTab?: ReviewTab
  initialSubset?: 'needs-category' | 'spending-excluded' | 'transaction'
  spendingPeriod?: string
  transactionId?: string
  planningFunds: Array<{ id: string; name: string }>
  owners: string[]
  globalCounts: ReviewQueueCounts
  pagination: { page: number; pageCount: number; pageSize: number; totalGroups: number }
}

type ReviewTab =
  | 'toReview'
  | 'ready'
  | 'duplicates'
  | 'ath'
  | 'all'

type CandidateGroup = {
  key: string
  candidates: ReviewQueueCandidate[]
  primary: ReviewQueueCandidate
}

function money(value: number | null | undefined) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function signedMoney(value: number | null | undefined) {
  const amount = Number(value || 0)
  return `${amount >= 0 ? '' : '-'}$${money(Math.abs(amount))}`
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

function confidenceExplanation(value: number) {
  if (value >= 0.75) {
    return {
      label: 'High confidence',
      helper: 'Mansor One has enough context to suggest the next step.',
    }
  }

  if (value >= 0.45) {
    return {
      label: 'Needs review',
      helper: 'There is useful context, but your decision is still needed.',
    }
  }

  return {
    label: 'Low confidence',
    helper: 'Mansor One does not have enough context to decide safely.',
  }
}

function metadataString(transaction: LedgerSummaryTransaction, key: string) {
  const value = transaction.metadata?.[key]
  return typeof value === 'string' && value ? value : null
}

function accountLabel(transaction: LedgerSummaryTransaction) {
  const institution = metadataString(transaction, 'institutionName')
  const account = metadataString(transaction, 'accountName')
  const mask = metadataString(transaction, 'accountMask')
  const accountText = [account, mask ? `••••${mask}` : null]
    .filter(Boolean)
    .join(' ')

  return [institution, accountText].filter(Boolean).join(' · ') || 'Unknown'
}

function sourceLabel(transaction: LedgerSummaryTransaction) {
  if (transaction.sourceTable === 'plaid_imports') return 'Plaid import'
  if (transaction.source === 'plaid') return 'Ledger confirmado · Plaid'

  return 'Ledger confirmado'
}

function categoryLabel(candidate: ReviewQueueCandidate) {
  return (
    candidate.canonicalCategory?.displayName ||
    candidate.suggestedCategory ||
    'Needs category'
  )
}

function needsCategoryAnswer(candidate: ReviewQueueCandidate) {
  const category = categoryLabel(candidate).toLowerCase()

  return (
    candidate.classification === 'needsCategory' ||
    candidate.classification === 'needsManualReview' ||
    category === 'revisar' ||
    category === 'needs category' ||
    category === 'sin categoría'
  )
}

function quickCategoryChoices(candidate: ReviewQueueCandidate) {
  const name = normalizedName(candidate).toLowerCase()

  if (name.includes('colegio') || name.includes('school')) {
    return ['School / Education', 'Tuition', 'Tutoring']
  }

  return []
}

function isExactImportedDuplicate(candidate: ReviewQueueCandidate) {
  const match = candidate.duplicateContext?.bestDuplicateMatch

  return Boolean(
    match?.matchType === 'plaid_transaction_id' && match.confidence === 100
  )
}

function isPossibleDuplicate(candidate: ReviewQueueCandidate) {
  return Boolean(candidate.duplicateContext && !isExactImportedDuplicate(candidate))
}

function subjectLabel(candidate: ReviewQueueCandidate) {
  const identity = candidate.financialIdentity.identityType

  if (identity === 'person' || identity === 'person_transfer') return 'Persona'
  if (identity === 'credit_card_payment') return 'Banco / Tarjeta'
  if (identity === 'government') return 'Gobierno'
  if (identity === 'income') return 'Empleador'
  if (candidate.classification === 'paymentConfirmation') return 'Payee / Beneficiario'

  return 'Comercio'
}

function normalizedName(candidate: ReviewQueueCandidate) {
  return candidate.merchant || candidate.transaction.description || 'Unknown'
}

function looksLikeMessage(candidate: ReviewQueueCandidate) {
  if (
    candidate.financialIdentity.identityType === 'person_transfer' ||
    candidate.financialIdentity.identityType === 'transfer'
  ) {
    return `Parece transferencia con ${normalizedName(candidate)}`
  }

  if (candidate.classification === 'athReview') {
    return `Parece ${normalizedName(candidate)} · ${categoryLabel(candidate)}`
  }

  return normalizedName(candidate)
}

function whatIsThis(candidate: ReviewQueueCandidate) {
  if (isExactImportedDuplicate(candidate)) return 'Ya importado'
  if (isPossibleDuplicate(candidate)) return '¿Duplicado o compra separada?'
  if (candidate.classification === 'needsCategory') return 'Movimiento sin categoría'
  if (candidate.classification === 'readyToConfirm') return 'Listo para confirmar'
  if (candidate.classification === 'athReview') return 'ATH detectado'
  if (candidate.classification === 'paymentConfirmation') return 'Pago posible'
  return 'Necesita decisión'
}

function whyIsItHere(candidate: ReviewQueueCandidate) {
  if (isExactImportedDuplicate(candidate)) {
    return 'Esta transacción exacta del banco ya está en Mansor One.'
  }

  if (isPossibleDuplicate(candidate)) {
    return 'Encontramos un movimiento parecido ya confirmado. Revisa si es el mismo o una compra separada.'
  }

  if (candidate.classification === 'needsCategory') {
    return 'Mansor One necesita una categoría antes de agregarlo al historial financiero.'
  }

  if (candidate.classification === 'readyToConfirm') {
    return 'Esto está listo para agregarse a tu historial financiero.'
  }

  if (candidate.classification === 'athReview') {
    return candidate.canonicalCategory
      ? 'Se detectó ATH y Mansor One encontró una categoría probable.'
      : 'Se detectó ATH pero necesita categoría o revisión de identidad.'
  }

  if (candidate.classification === 'paymentConfirmation') {
    return 'Este movimiento puede cerrar un pago esperado.'
  }

  return candidate.reasons[0] || 'Esto necesita una revisión rápida.'
}

function whatShouldIDo(candidate: ReviewQueueCandidate) {
  if (isExactImportedDuplicate(candidate)) return 'Mark as duplicate'
  if (isPossibleDuplicate(candidate)) {
    return 'Decide whether this is the same transaction or a separate purchase.'
  }
  if (candidate.classification === 'needsCategory') {
    return 'Confirm the suggested category or change it before adding.'
  }
  if (candidate.financialIdentity.identityType === 'person_transfer') {
    return 'Confirm as internal transfer'
  }
  if (candidate.classification === 'athReview') {
    return 'Confirm whether this ATH should be added with this category.'
  }
  if (candidate.classification === 'readyToConfirm') {
    return 'Confirm whether it should be added to financial history.'
  }

  return 'Review later'
}

function whatHappens(candidate: ReviewQueueCandidate) {
  if (isExactImportedDuplicate(candidate)) {
    return [
      'Marks the Plaid import as already represented',
      'Keeps the existing confirmed movement',
    ]
  }

  if (candidate.classification === 'readyToConfirm') {
    return [
      'Adds the movement to financial history',
      'Marks the Plaid import as imported',
      'Removes it from Review Queue',
    ]
  }

  if (
    candidate.classification === 'needsCategory' ||
    candidate.classification === 'athReview'
  ) {
    return [
      'Adds the movement to financial history with the selected category',
      'Marks the Plaid import as imported',
      'Removes it from Review Queue',
    ]
  }

  return ['Keeps the movement in Review Queue for later review']
}

function logicalGroupKey(candidate: ReviewQueueCandidate) {
  const duplicate = candidate.duplicateContext?.bestDuplicateMatch

  if (duplicate) {
    return [
      candidate.classification,
      duplicate.matchType,
      duplicate.confirmedLedgerEntry.id,
      duplicate.confidence === 100 ? 'exact' : 'possible',
    ].join(':')
  }

  return [
    candidate.classification,
    candidate.transaction.plaidTransactionId || candidate.transaction.id,
  ].join(':')
}

function groupCandidates(candidates: ReviewQueueCandidate[]) {
  const groups = new Map<string, ReviewQueueCandidate[]>()

  candidates.forEach((candidate) => {
    const key = logicalGroupKey(candidate)
    const group = groups.get(key) || []
    group.push(candidate)
    groups.set(key, group)
  })

  return [...groups.entries()].map(([key, group]) => ({
    key,
    candidates: group,
    primary: group[0],
  }))
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return

  const headers = Object.keys(rows[0])
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportRows(candidates: ReviewQueueCandidate[]) {
  return candidates.map((candidate) => ({
    subject: normalizedName(candidate),
    subject_label: subjectLabel(candidate),
    amount: candidate.transaction.amount,
    date: candidate.transaction.date || '',
    account: accountLabel(candidate.transaction),
    bucket: candidate.classification,
    suggested_action: whatShouldIDo(candidate),
    suggested_category: categoryLabel(candidate),
    reason: whyIsItHere(candidate),
    confidence: percent(candidate.confidence),
  }))
}

function DetailTransaction({
  title,
  transaction,
}: {
  title: string
  transaction: LedgerSummaryTransaction
}) {
  return (
    <div className="border rounded p-3 space-y-1">
      <h4 className="font-semibold">{title}</h4>
      <p>
        {transaction.description || 'Desconocido'} · {signedMoney(transaction.amount)} ·{' '}
        {transaction.date || 'Sin fecha'}
      </p>
      <p>{accountLabel(transaction)}</p>
      <p>{transaction.category || 'Sin categoría'}</p>
    </div>
  )
}

function DuplicateComparison({ candidate }: { candidate: ReviewQueueCandidate }) {
  const match = candidate.duplicateContext?.bestDuplicateMatch

  if (!match) return null

  const compared = match.confirmedLedgerEntry

  return (
    <div className="border rounded p-3 text-sm space-y-3">
      <div>
        <p className="font-semibold">
          Is this the same transaction or a separate purchase?
        </p>
        <p className="text-sm opacity-70">
          Compare the candidate against the confirmed movement before deciding.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <p className="font-semibold">Source</p>
          <p>{sourceLabel(compared)}</p>
        </div>
        <div className="md:col-span-2">
          <p className="font-semibold">Merchant / description</p>
          <p>{compared.description || 'Desconocido'}</p>
        </div>
        <div>
          <p className="font-semibold">Date</p>
          <p>{compared.date || 'Sin fecha'}</p>
        </div>
        <div>
          <p className="font-semibold">Amount</p>
          <p>{signedMoney(compared.amount)}</p>
        </div>
        <div className="md:col-span-3">
          <p className="font-semibold">Institution / account</p>
          <p>{accountLabel(compared)}</p>
        </div>
        <div className="md:col-span-2">
          <p className="font-semibold">Match reason</p>
          <p>{match.reasons.join(' ')}</p>
        </div>
      </div>
    </div>
  )
}

function TechnicalDetails({
  candidate,
  open = false,
}: {
  candidate: ReviewQueueCandidate
  open?: boolean
}) {
  const match = candidate.reconciliationContext?.match

  return (
    <details className="border rounded p-3 text-sm" open={open}>
      <summary className="font-semibold cursor-pointer">
        Mostrar detalles técnicos
      </summary>

      <div className="mt-3 space-y-3">
        <div className="border rounded p-3 space-y-1">
          <h4 className="font-semibold">Confidence</h4>
          <p>
            {confidenceExplanation(candidate.confidence).label} ·{' '}
            {percent(candidate.confidence)}
          </p>
          <p className="opacity-70">
            {confidenceExplanation(candidate.confidence).helper}
          </p>
        </div>

        {candidate.duplicateContext && (
          <div className="space-y-2">
            <DetailTransaction
              title="Candidato de importación"
              transaction={candidate.duplicateContext.importCandidate}
            />
            <DetailTransaction
              title="Movimiento confirmado relacionado"
              transaction={
                candidate.duplicateContext.bestDuplicateMatch.confirmedLedgerEntry
              }
            />
          </div>
        )}

        {match && (
          <div className="border rounded p-3 space-y-2">
            <h4 className="font-semibold">Pago relacionado</h4>
            <p>
              {match.paymentName || 'Pago'} · {signedMoney(match.paymentAmount)} ·{' '}
              {match.paymentStatus || 'unknown'}
            </p>
            <ul className="list-disc pl-5">
              {match.scoreFactors.map((factor) => (
                <li key={factor.code}>
                  {factor.label}: {factor.details} ({factor.score})
                </li>
              ))}
            </ul>
          </div>
        )}

        {candidate.merchantKnowledge && (
          <div className="border rounded p-3 space-y-2">
            <h4 className="font-semibold">Aprendizaje de comercio</h4>
            <p>
              {candidate.merchantKnowledge.learningStatus} ·{' '}
              {percent(candidate.merchantKnowledge.currentConfidence)}
            </p>
            <ul className="list-disc pl-5">
              {candidate.merchantKnowledge.learningBlockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h4 className="font-semibold">Razones técnicas</h4>
          <ul className="list-disc pl-5">
            {candidate.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  )
}

function CandidateActions({
  group,
  categoryOptions,
  onSkip,
  onReviewDetails,
}: {
  group: CandidateGroup
  categoryOptions: CategoryOption[]
  onSkip: () => void
  onReviewDetails?: () => void
}) {
  const candidate = group.primary
  const [changeCategory, setChangeCategory] = useState(false)
  const [duplicateMessage, setDuplicateMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const category = candidate.canonicalCategory?.displayName || ''

  async function markDuplicateGroupImported() {
    setDuplicateMessage('')

    const results = await Promise.all(
      group.candidates.map((item) =>
        fetch('/api/review-queue/confirm-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plaidImportId: item.transaction.id }),
        }).then(async (response) => ({
          ok: response.ok,
          data: await response.json(),
        }))
      )
    )
    const failed = results.find((result) => !result.ok || result.data.error)

    if (failed) {
      setDuplicateMessage(failed.data.error || 'Could not mark duplicate')
      return
    }

    setDuplicateMessage('Marked as duplicate')
    startTransition(() => router.refresh())
  }

  async function resolvePossibleDuplicate(action: 'mark_duplicate' | 'keep_separate') {
    setDuplicateMessage('')

    const response = await fetch('/api/review-queue/resolve-duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        plaidImportId: candidate.transaction.id,
        selectedCategory:
          action === 'keep_separate'
            ? candidate.canonicalCategory?.displayName || undefined
            : undefined,
      }),
    })
    const data = await response.json()

    if (!response.ok || data.error) {
      setDuplicateMessage(data.error || 'Could not resolve duplicate')
      return
    }

    setDuplicateMessage(
      action === 'mark_duplicate'
        ? 'Marked as duplicate'
        : 'Kept as separate transaction'
    )
    startTransition(() => router.refresh())
  }

  if (isExactImportedDuplicate(candidate)) {
    return (
      <div className="flex items-center gap-3">
        <button
          className="border rounded px-3 py-2 text-sm font-medium disabled:opacity-60"
          disabled={isPending}
          onClick={markDuplicateGroupImported}
          type="button"
        >
          Mark as duplicate
        </button>
        {duplicateMessage && <p className="text-sm opacity-70">{duplicateMessage}</p>}
      </div>
    )
  }

  if (isPossibleDuplicate(candidate)) {
    return (
      <div className="flex flex-wrap gap-3">
        <button
          className="border rounded px-3 py-2 text-sm font-medium disabled:opacity-60"
          disabled={isPending}
          onClick={() => resolvePossibleDuplicate('mark_duplicate')}
          type="button"
        >
          Mark as duplicate
        </button>
        <button
          className="border rounded px-3 py-2 text-sm font-medium disabled:opacity-60"
          disabled={isPending}
          onClick={() => resolvePossibleDuplicate('keep_separate')}
          type="button"
        >
          Keep as separate transaction
        </button>
        <button
          className="border rounded px-3 py-2 text-sm"
          disabled={isPending}
          onClick={onReviewDetails}
          type="button"
        >
          Compare transactions
        </button>
        <button
          className="border rounded px-3 py-2 text-sm"
          disabled={isPending}
          onClick={onSkip}
          type="button"
        >
          Review later
        </button>
        <p className="basis-full text-xs opacity-70">
          Mark as duplicate and keep as separate transaction are intentionally
          manual decisions. Compare the records first; no automatic decision is
          made.
        </p>
        {duplicateMessage && (
          <p className="basis-full text-sm opacity-70">{duplicateMessage}</p>
        )}
      </div>
    )
  }

  if (needsCategoryAnswer(candidate)) {
    return (
      <ReviewQueueCandidateActions
        buttonLabel="Confirm category"
        categories={categoryOptions}
        mode={
          candidate.classification === 'needsManualReview'
            ? 'needsManualReview'
            : 'needsCategory'
        }
        onSkip={onSkip}
        plaidImportId={candidate.transaction.id}
        quickCategories={quickCategoryChoices(candidate)}
      />
    )
  }

  if (candidate.classification === 'athReview') {
    if (changeCategory || !category) {
      return (
        <ReviewQueueCandidateActions
          buttonLabel="Confirm category"
          categories={categoryOptions}
          mode="athReview"
          onSkip={onSkip}
          plaidImportId={candidate.transaction.id}
        />
      )
    }

    return (
      <div className="flex flex-wrap gap-3">
        <ReviewQueueCandidateActions
          buttonLabel={
            candidate.financialIdentity.identityType === 'person_transfer'
              ? 'Confirm as internal transfer'
              : 'Confirm category'
          }
          mode="athReview"
          plaidImportId={candidate.transaction.id}
          selectedCategoryOverride={category}
        />
        <button
          className="border rounded px-3 py-2 text-sm"
          onClick={() => setChangeCategory(true)}
          type="button"
        >
          Change category
        </button>
        <button className="border rounded px-3 py-2 text-sm" onClick={onSkip} type="button">
          Review later
        </button>
      </div>
    )
  }

  if (candidate.financialIdentity.identityType === 'person_transfer') {
    return (
      <ReviewQueueCandidateActions
        buttonLabel="Confirm as internal transfer"
        mode="readyToConfirm"
        onSkip={onSkip}
        plaidImportId={candidate.transaction.id}
        selectedCategoryOverride="Internal Transfer"
      />
    )
  }

  if (candidate.classification === 'readyToConfirm') {
    return (
      <ReviewQueueCandidateActions
        buttonLabel="Confirm and add"
        mode="readyToConfirm"
        onSkip={onSkip}
        plaidImportId={candidate.transaction.id}
      />
    )
  }

  return (
    <button className="border rounded px-3 py-2 text-sm" onClick={onSkip} type="button">
      Review later
    </button>
  )
}

function CandidateCard({
  group,
  categoryOptions,
  onSkip,
  planningFunds,
  owners,
}: {
  group: CandidateGroup
  categoryOptions: CategoryOption[]
  onSkip: () => void
  planningFunds: Array<{ id: string; name: string }>
  owners: string[]
}) {
  return (
    <ActionableTransactionCard
      candidate={group.primary}
      categories={categoryOptions}
      onReviewLater={onSkip}
      owners={owners}
      planningFunds={planningFunds}
    />
  )
}

export function ReviewQueueClient({
  candidates,
  readyToConfirm,
  needsCategory,
  possibleDuplicate,
  athReview,
  paymentConfirmation,
  needsManualReview,
  categoryOptions,
  initialTab = 'toReview',
  initialSubset,
  spendingPeriod,
  transactionId,
  planningFunds,
  owners,
  globalCounts,
  pagination,
}: ReviewQueueClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeTab = initialTab
  const [showFilters, setShowFilters] = useState(false)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [skippedKeys, setSkippedKeys] = useState<string[]>([])
  function navigateQueue(next: { tab?: ReviewTab; page?: number }) {
    const params = new URLSearchParams(searchParams.toString())
    if (next.tab) {
      params.set('tab', next.tab)
      params.delete('subset')
      params.delete('transaction')
      params.set('page', '1')
    }
    if (next.page) params.set('page', String(next.page))
    router.push(`?${params.toString()}#queue`)
  }
  const exactDuplicates = useMemo(
    () => possibleDuplicate.filter(isExactImportedDuplicate),
    [possibleDuplicate]
  )
  const possibleDuplicates = useMemo(
    () => possibleDuplicate.filter(isPossibleDuplicate),
    [possibleDuplicate]
  )
  const visibleCandidates = candidates.filter(
    (candidate) => !isExactImportedDuplicate(candidate)
  )
  const toReview = [
    ...needsCategory,
    ...possibleDuplicates,
    ...athReview,
    ...paymentConfirmation,
    ...needsManualReview,
  ]
  const tabCandidates: Record<ReviewTab, ReviewQueueCandidate[]> = {
    toReview,
    ready: readyToConfirm,
    duplicates: possibleDuplicate,
    ath: athReview,
    all: candidates,
  }
  const selectedCandidates = initialSubset === 'needs-category' && activeTab === 'toReview'
    ? needsCategory
    : initialSubset === 'spending-excluded' && activeTab === 'all'
      ? candidates.filter((candidate) =>
          Boolean(
            spendingPeriod &&
            candidate.transaction.date?.startsWith(spendingPeriod) &&
            candidate.transaction.metadata.pending !== true &&
            candidate.transaction.metadata.transactionStatus !== 'pending'
          )
        )
      : initialSubset === 'transaction' && activeTab === 'all'
        ? candidates.filter((candidate) => candidate.transaction.id === transactionId)
      : tabCandidates[activeTab]
  const filteredCandidates = selectedCandidates.filter((candidate) => {
    const text = [
      normalizedName(candidate),
      accountLabel(candidate.transaction),
      categoryLabel(candidate),
      candidate.classification,
    ]
      .join(' ')
      .toLowerCase()

    return (
      (!query || text.includes(query.toLowerCase())) &&
      (!categoryFilter ||
        categoryLabel(candidate).toLowerCase().includes(categoryFilter.toLowerCase()))
    )
  })
  const groups = groupCandidates(filteredCandidates).filter(
    (group) => !skippedKeys.includes(group.key)
  )
  const tabs: { id: ReviewTab; label: string; count: number }[] = [
    { id: 'toReview', label: 'Needs review', count: globalCounts.toReview },
    { id: 'ready', label: 'Ready', count: globalCounts.ready },
    { id: 'duplicates', label: 'Possible duplicates', count: globalCounts.duplicates },
    { id: 'ath', label: 'ATH transactions', count: globalCounts.ath },
    { id: 'all', label: 'All', count: globalCounts.all },
  ]
  const summaryCards = [
    { label: 'Needs review', value: globalCounts.toReview, icon: '!', accent: 'border-amber-400/30 bg-amber-400/10 text-amber-200' },
    { label: 'Ready', value: globalCounts.ready, icon: '✓', accent: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' },
    { label: 'Possible duplicates', value: globalCounts.duplicates, icon: '◇', accent: 'border-violet-400/30 bg-violet-400/10 text-violet-200' },
    { label: 'ATH transactions', value: globalCounts.ath, icon: 'A', accent: 'border-sky-400/30 bg-sky-400/10 text-sky-200' },
    { label: 'Visible transactions', value: globalCounts.visible, icon: '≡', accent: 'border-indigo-400/30 bg-indigo-400/10 text-indigo-200' },
  ]

  if (globalCounts.all === 0 && globalCounts.toReview === 0) {
    return <section className="rounded-2xl border border-emerald-900/60 bg-emerald-950/20 p-8 text-center shadow-[0_20px_70px_rgba(0,0,0,0.18)]"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-emerald-700 bg-emerald-900/40 text-emerald-200" aria-hidden="true">✓</div><h2 className="mt-4 text-2xl font-bold text-white">Todo está al día</h2><p className="mt-2 text-slate-300">No hay movimientos que requieran tu revisión.</p></section>
  }

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Queue summary">
        {summaryCards.map((card) => (
          <div className="rounded-xl border border-slate-700/70 bg-[#0d1b35] p-3.5 shadow-sm shadow-black/15" key={card.label}>
            <div className="flex items-center gap-3">
              <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm font-bold ${card.accent}`} aria-hidden="true">{card.icon}</span>
              <div className="min-w-0">
                <h2 className="truncate text-xs font-semibold text-slate-300">{card.label}</h2>
                <p className="mt-0.5 text-2xl font-bold leading-none text-white">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-700/70 bg-[#0b1730] p-3 shadow-sm shadow-black/15">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-full overflow-x-auto pb-1 xl:pb-0">
            <div className="inline-flex min-w-max rounded-lg border border-slate-700 bg-[#081225] p-1" role="group" aria-label="Queue views">
              {tabs.map((tab) => (
                <button
                  aria-pressed={activeTab === tab.id}
                  className={`min-h-11 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 ${
                    activeTab === tab.id
                      ? 'bg-indigo-500/25 text-indigo-100 shadow-sm ring-1 ring-inset ring-indigo-400/40'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                  }`}
                  key={tab.id}
                  onClick={() => navigateQueue({ tab: tab.id })}
                  type="button"
                >
                  {tab.label} <span className="ml-1 text-xs opacity-75">{tab.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end" aria-label="Queue tools">
            <button
              aria-expanded={showFilters}
              className="min-h-11 rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-700/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
              onClick={() => setShowFilters((value) => !value)}
              type="button"
            >
              Filtros
            </button>
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-700 bg-[#081225] p-1">
              <button
                className="min-h-11 rounded-md px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-300"
                onClick={() => downloadCsv('review-queue.csv', exportRows(visibleCandidates))}
                type="button"
              >
                Exportar cola
              </button>
              <button
                className="min-h-11 rounded-md px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-300"
                onClick={() =>
                  downloadCsv('possible-duplicates.csv', exportRows(possibleDuplicate))
                }
                type="button"
              >
                Exportar duplicados
              </button>
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-700/70 pt-3 md:grid-cols-3">
            <label className="text-sm text-slate-300">
              Search
              <input
                className="mt-1 w-full rounded-lg border border-slate-600 bg-[#081225] px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-300"
                onChange={(event) => setQuery(event.target.value)}
                value={query}
              />
            </label>
            <label className="text-sm text-slate-300">
              Category
              <input
                className="mt-1 w-full rounded-lg border border-slate-600 bg-[#081225] px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-300"
                onChange={(event) => setCategoryFilter(event.target.value)}
                value={categoryFilter}
              />
            </label>
            <div className="flex items-end">
              <button
                className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
                onClick={() => {
                  setQuery('')
                  setCategoryFilter('')
                }}
                type="button"
              >
                Clear filters
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        {groups.map((group) => (
          <CandidateCard
            categoryOptions={categoryOptions}
            group={group}
            key={group.key}
            onSkip={() => setSkippedKeys((keys) => [...keys, group.key])}
            owners={owners}
            planningFunds={planningFunds}
          />
        ))}
        {groups.length === 0 && (
          <div className="border rounded p-4 opacity-70">No transactions in this view.</div>
        )}
      </section>

      {pagination.pageCount > 1 && <nav aria-label="Páginas de Review Queue" className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/70 bg-[#0b1730] p-3">
        <button className="min-h-11 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold disabled:opacity-40" disabled={pagination.page <= 1} onClick={() => navigateQueue({ page: pagination.page - 1 })} type="button">Anterior</button>
        <p className="text-center text-sm text-slate-300">Página {pagination.page} de {pagination.pageCount} · {pagination.totalGroups} grupos · máximo {pagination.pageSize} por página</p>
        <button className="min-h-11 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold disabled:opacity-40" disabled={pagination.page >= pagination.pageCount} onClick={() => navigateQueue({ page: pagination.page + 1 })} type="button">Siguiente</button>
      </nav>}

      {exactDuplicates.length > 0 && (
        <details className="border rounded p-4">
          <summary className="font-semibold">
            View technical details ({exactDuplicates.length} exact source duplicates)
          </summary>
          <div className="mt-3 space-y-3">
            {groupCandidates(exactDuplicates).map((group) => (
              <CandidateCard
                categoryOptions={categoryOptions}
                group={group}
                key={group.key}
                onSkip={() => setSkippedKeys((keys) => [...keys, group.key])}
                owners={owners}
                planningFunds={planningFunds}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
