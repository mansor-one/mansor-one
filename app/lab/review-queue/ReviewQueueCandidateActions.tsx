'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type ReviewQueueActionMode =
  | 'readyToConfirm'
  | 'needsCategory'
  | 'needsManualReview'
  | 'possibleDuplicate'
  | 'athReview'

type CategoryOption = {
  value: string
  label: string
  kind?: string
}

const categoryKindLabels: Record<string, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  payment: 'Debt / Payment',
  adjustment: 'Adjustment',
}

export function ReviewQueueCandidateActions({
  plaidImportId,
  mode,
  categories = [],
  buttonLabel,
  selectedCategoryOverride,
  quickCategories = [],
  onSkip,
}: {
  plaidImportId: string
  mode: ReviewQueueActionMode
  categories?: CategoryOption[]
  buttonLabel?: string
  selectedCategoryOverride?: string
  quickCategories?: string[]
  onSkip?: () => void
}) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedCategoryState, setSelectedCategoryState] = useState('')

  async function postAction() {
    setIsSubmitting(true)
    setMessage('')

    try {
      const isDuplicateAction = mode === 'possibleDuplicate'
      const selectedCategory =
        mode === 'needsCategory' ||
        mode === 'needsManualReview' ||
        mode === 'athReview'
          ? selectedCategoryOverride || selectedCategoryState
          : selectedCategoryOverride
      const response = await fetch(
        isDuplicateAction
          ? '/api/review-queue/confirm-duplicate'
          : '/api/review-queue/confirm-import',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isDuplicateAction
              ? { plaidImportId }
              : {
                  plaidImportId,
                  selectedCategory: selectedCategory || undefined,
                  expectedClassification: mode,
                }
          ),
        }
      )
      const data = await response.json()

      if (!response.ok || data.error) {
        setMessage(data.error || 'Could not complete action')
        return
      }

      setMessage(
        isDuplicateAction ? 'Marcado como ya importado' : 'Agregado al historial'
      )
      startTransition(() => {
        router.refresh()
      })
    } catch {
      setMessage('Could not complete action')
    } finally {
      setIsSubmitting(false)
    }
  }

  const disabled = isSubmitting || isPending
  const uniqueCategories = categories.filter((category, index, list) => {
    return list.findIndex((item) => item.value === category.value) === index
  })
  const groupedCategories = uniqueCategories.reduce(
    (groups, category) => {
      const kind = category.kind || 'expense'
      return {
        ...groups,
        [kind]: [...(groups[kind] || []), category],
      }
    },
    {} as Record<string, CategoryOption[]>
  )

  const needsCategoryChoice =
    mode === 'needsCategory' ||
    mode === 'needsManualReview' ||
    (mode === 'athReview' && !selectedCategoryOverride)

  if (needsCategoryChoice) {
    return (
      <div className="space-y-2 pt-1">
        {quickCategories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {quickCategories.map((category) => (
              <button
                className={`rounded border px-3 py-2 text-sm ${
                  selectedCategoryState === category
                    ? 'border-slate-500 bg-slate-900 text-white dark:border-slate-300 dark:bg-slate-100 dark:text-slate-950'
                    : ''
                }`}
                disabled={disabled}
                key={category}
                onClick={() => setSelectedCategoryState(category)}
                type="button"
              >
                {category}
              </button>
            ))}
          </div>
        )}

        <select
          className="rounded border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          disabled={disabled}
          onChange={(event) => setSelectedCategoryState(event.target.value)}
          value={selectedCategoryState}
        >
          <option value="">Seleccionar categoría</option>
          {Object.entries(groupedCategories).map(([kind, options]) => (
            <optgroup key={kind} label={categoryKindLabels[kind] || kind}>
              {options.map((category, index) => (
                <option
                  key={`${kind}-${category.value}-${index}`}
                  value={category.value}
                >
                  {category.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <div className="flex items-center gap-3">
          {selectedCategoryState && (
            <button
              className="border rounded px-3 py-2 text-sm font-medium disabled:opacity-60"
              disabled={disabled}
              onClick={postAction}
              type="button"
            >
              {disabled ? 'Agregando...' : buttonLabel || 'Agregar al historial'}
            </button>
          )}

          {onSkip && (
            <button
              className="border rounded px-3 py-2 text-sm"
              disabled={disabled}
              onClick={onSkip}
              type="button"
            >
              Saltar por ahora
            </button>
          )}

          {message && <p className="text-sm opacity-70">{message}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 pt-1">
      <button
        className="border rounded px-3 py-2 text-sm font-medium disabled:opacity-60"
        disabled={disabled}
        onClick={postAction}
        type="button"
      >
        {disabled
          ? 'Working...'
          : mode === 'possibleDuplicate'
            ? buttonLabel || 'Marcar como ya importado'
            : buttonLabel || 'Agregar al historial'}
      </button>

      {onSkip && (
        <button
          className="border rounded px-3 py-2 text-sm"
          disabled={disabled}
          onClick={onSkip}
          type="button"
        >
          Saltar por ahora
        </button>
      )}

      {message && <p className="text-sm opacity-70">{message}</p>}
    </div>
  )
}
