'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ReviewQueueCandidateActions } from './ReviewQueueCandidateActions'
import type {
  LedgerSummaryTransaction,
  ReviewQueueCandidate,
} from '@/lib/financial-engine'

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
  if (isPossibleDuplicate(candidate)) return 'Posible duplicado'
  if (candidate.classification === 'needsCategory') return 'Movimiento sin categoría'
  if (candidate.classification === 'readyToConfirm') return 'Movimiento listo'
  if (candidate.classification === 'athReview') return 'Revisión ATH'
  if (candidate.classification === 'paymentConfirmation') return 'Pago posible'
  return 'Revisión necesaria'
}

function whyIsItHere(candidate: ReviewQueueCandidate) {
  if (isExactImportedDuplicate(candidate)) {
    return 'Esta transacción exacta del banco ya está en Mansor One.'
  }

  if (isPossibleDuplicate(candidate)) {
    return 'Esto puede ser una compra separada.'
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
  if (isExactImportedDuplicate(candidate)) return 'Marcar como ya importado'
  if (isPossibleDuplicate(candidate)) return 'Revisar detalles'
  if (candidate.classification === 'needsCategory') return 'Escoger categoría'
  if (candidate.financialIdentity.identityType === 'person_transfer') {
    return 'Confirmar como transferencia interna'
  }
  if (candidate.classification === 'athReview') return 'Confirmar como comercio'
  if (candidate.classification === 'readyToConfirm') return 'Agregar al historial'

  return 'Saltar por ahora'
}

function whatHappens(candidate: ReviewQueueCandidate) {
  if (isExactImportedDuplicate(candidate)) {
    return ['Marca el import de Plaid como importado', 'Mantiene el movimiento confirmado existente']
  }

  if (candidate.classification === 'readyToConfirm') {
    return [
      'Agrega el movimiento al historial financiero',
      'Marca el import de Plaid como importado',
      'Lo remueve del Review Queue',
    ]
  }

  if (
    candidate.classification === 'needsCategory' ||
    candidate.classification === 'athReview'
  ) {
    return [
      'Agrega el movimiento al historial financiero con la categoría seleccionada',
      'Marca el import de Plaid como importado',
      'Lo remueve del Review Queue',
    ]
  }

  return ['Deja el movimiento en Review Queue para revisarlo luego']
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

function TechnicalDetails({ candidate }: { candidate: ReviewQueueCandidate }) {
  const match = candidate.reconciliationContext?.match

  return (
    <details className="border rounded p-3 text-sm">
      <summary className="font-semibold cursor-pointer">
        Mostrar detalles técnicos
      </summary>

      <div className="mt-3 space-y-3">
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
}: {
  group: CandidateGroup
  categoryOptions: CategoryOption[]
  onSkip: () => void
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

      setDuplicateMessage('Marcado como ya importado')
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
          Marcar como ya importado
        </button>
        {duplicateMessage && <p className="text-sm opacity-70">{duplicateMessage}</p>}
      </div>
    )
  }

  if (isPossibleDuplicate(candidate)) {
    return (
      <div className="flex flex-wrap gap-3">
        <a className="border rounded px-3 py-2 text-sm" href={`#details-${group.key}`}>
          Revisar detalles
        </a>
        <button className="border rounded px-3 py-2 text-sm" onClick={onSkip} type="button">
          Saltar por ahora
        </button>
      </div>
    )
  }

  if (needsCategoryAnswer(candidate)) {
    return (
      <ReviewQueueCandidateActions
        buttonLabel="Agregar al historial"
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
          buttonLabel="Confirmar y agregar al historial"
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
              ? 'Confirmar como transferencia interna'
              : 'Confirmar y agregar al historial'
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
          Cambiar categoría
        </button>
        <button className="border rounded px-3 py-2 text-sm" onClick={onSkip} type="button">
          Saltar por ahora
        </button>
      </div>
    )
  }

  if (candidate.financialIdentity.identityType === 'person_transfer') {
    return (
      <ReviewQueueCandidateActions
        buttonLabel="Confirmar como transferencia interna"
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
        buttonLabel="Agregar al historial"
        mode="readyToConfirm"
        onSkip={onSkip}
        plaidImportId={candidate.transaction.id}
      />
    )
  }

  return (
    <button className="border rounded px-3 py-2 text-sm" onClick={onSkip} type="button">
      Saltar por ahora
    </button>
  )
}

function CandidateCard({
  group,
  categoryOptions,
  onSkip,
}: {
  group: CandidateGroup
  categoryOptions: CategoryOption[]
  onSkip: () => void
}) {
  const candidate = group.primary
  const happens = whatHappens(candidate)

  return (
    <div className="border rounded p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold opacity-70">{whatIsThis(candidate)}</p>
          <h3 className="text-xl font-bold">{looksLikeMessage(candidate)}</h3>
          {group.candidates.length > 1 && (
            <p className="text-sm opacity-70">
              Agrupamos {group.candidates.length} filas relacionadas.
            </p>
          )}
        </div>
        <p className="text-sm">{percent(candidate.confidence)} confianza</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 text-sm">
        <div className="md:col-span-2">
          <p className="font-semibold">{subjectLabel(candidate)}</p>
          <p>{normalizedName(candidate)}</p>
        </div>
        <div>
          <p className="font-semibold">Monto</p>
          <p>{signedMoney(candidate.transaction.amount)}</p>
        </div>
        <div>
          <p className="font-semibold">Fecha</p>
          <p>{candidate.transaction.date || 'Sin fecha'}</p>
        </div>
        <div className="md:col-span-2">
          <p className="font-semibold">Banco / cuenta</p>
          <p>{accountLabel(candidate.transaction)}</p>
        </div>
        <div className="md:col-span-2">
          <p className="font-semibold">Por qué aparece?</p>
          <p>{whyIsItHere(candidate)}</p>
        </div>
        <div className="md:col-span-2">
          <p className="font-semibold">Qué debo hacer?</p>
          <p>{whatShouldIDo(candidate)}</p>
        </div>
        <div className="md:col-span-2">
          <p className="font-semibold">Categoría sugerida</p>
          <p>{categoryLabel(candidate)}</p>
        </div>
      </div>

      <div className="border rounded p-3 text-sm">
        <p className="font-semibold">Qué pasa al hacer clic?</p>
        <ul className="list-disc pl-5">
          {happens.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <CandidateActions
        categoryOptions={categoryOptions}
        group={group}
        onSkip={onSkip}
      />

      <div id={`details-${group.key}`}>
        <TechnicalDetails candidate={candidate} />
      </div>
    </div>
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
}: ReviewQueueClientProps) {
  const [activeTab, setActiveTab] = useState<ReviewTab>('toReview')
  const [showFilters, setShowFilters] = useState(false)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [skippedKeys, setSkippedKeys] = useState<string[]>([])
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
    duplicates: possibleDuplicates,
    ath: athReview,
    all: visibleCandidates,
  }
  const filteredCandidates = tabCandidates[activeTab].filter((candidate) => {
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
    { id: 'toReview', label: 'Por revisar', count: toReview.length },
    { id: 'ready', label: 'Listos', count: readyToConfirm.length },
    { id: 'duplicates', label: 'Parecidas', count: possibleDuplicates.length },
    { id: 'ath', label: 'ATH', count: athReview.length },
    { id: 'all', label: 'Todo', count: visibleCandidates.length },
  ]
  const summaryCards = [
    { label: 'Por revisar', value: toReview.length },
    { label: 'Listos', value: readyToConfirm.length },
    { label: 'Parecidas', value: possibleDuplicates.length },
    { label: 'ATH', value: athReview.length },
    { label: 'Todo visible', value: visibleCandidates.length },
    { label: 'Diagnóstico exacto', value: exactDuplicates.length },
  ]

  return (
    <div className="space-y-6">
      <section className="border rounded p-4 bg-yellow-50 text-yellow-950">
        <h2 className="font-semibold">Validation Mode</h2>
        <p className="text-sm">
          No automatic decisions. You control what gets added.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {summaryCards.map((card) => (
          <div className="border rounded p-4" key={card.label}>
            <h2 className="font-semibold">{card.label}</h2>
            <p className="mt-3 text-3xl font-bold">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="border rounded p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              className={`rounded border px-3 py-2 text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-slate-500 bg-slate-900 font-bold text-white shadow-sm dark:border-slate-300 dark:bg-slate-100 dark:text-slate-950'
                  : 'border-slate-300 bg-transparent text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800'
              }`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label} ({tab.count})
            </button>
          ))}
          <button
            className="border rounded px-3 py-2 text-sm"
            onClick={() => setShowFilters((value) => !value)}
            type="button"
          >
            Filtros
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm">
              Buscar
              <input
                className="mt-1 w-full border rounded px-3 py-2"
                onChange={(event) => setQuery(event.target.value)}
                value={query}
              />
            </label>
            <label className="text-sm">
              Categoría
              <input
                className="mt-1 w-full border rounded px-3 py-2"
                onChange={(event) => setCategoryFilter(event.target.value)}
                value={categoryFilter}
              />
            </label>
            <div className="flex items-end">
              <button
                className="border rounded px-3 py-2 text-sm"
                onClick={() => {
                  setQuery('')
                  setCategoryFilter('')
                }}
                type="button"
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="border rounded p-4 flex flex-wrap gap-3">
        <button
          className="border rounded px-3 py-2 text-sm font-medium"
          onClick={() => downloadCsv('review-queue.csv', exportRows(visibleCandidates))}
          type="button"
        >
          Exportar Review Queue CSV
        </button>
        <button
          className="border rounded px-3 py-2 text-sm font-medium"
          onClick={() =>
            downloadCsv('possible-duplicates.csv', exportRows(possibleDuplicate))
          }
          type="button"
        >
          Exportar posibles duplicados CSV
        </button>
      </section>

      <section className="space-y-3">
        {groups.map((group) => (
          <CandidateCard
            categoryOptions={categoryOptions}
            group={group}
            key={group.key}
            onSkip={() => setSkippedKeys((keys) => [...keys, group.key])}
          />
        ))}
        {groups.length === 0 && (
          <div className="border rounded p-4 opacity-70">No hay movimientos en esta vista.</div>
        )}
      </section>

      {exactDuplicates.length > 0 && (
        <details className="border rounded p-4">
          <summary className="font-semibold">
            Dev / Diagnostics: exact Plaid duplicates ({exactDuplicates.length})
          </summary>
          <div className="mt-3 space-y-3">
            {groupCandidates(exactDuplicates).map((group) => (
              <CandidateCard
                categoryOptions={categoryOptions}
                group={group}
                key={group.key}
                onSkip={() => setSkippedKeys((keys) => [...keys, group.key])}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
