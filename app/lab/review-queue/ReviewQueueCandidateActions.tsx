'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type ReviewQueueActionMode =
  | 'readyToConfirm'
  | 'needsCategory'
  | 'possibleDuplicate'

type CategoryOption = {
  value: string
  label: string
}

export function ReviewQueueCandidateActions({
  plaidImportId,
  mode,
  categories = [],
}: {
  plaidImportId: string
  mode: ReviewQueueActionMode
  categories?: CategoryOption[]
}) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('')

  async function postAction() {
    setIsSubmitting(true)
    setMessage('')

    try {
      const isDuplicateAction = mode === 'possibleDuplicate'
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
                  selectedCategory:
                    mode === 'needsCategory' ? selectedCategory : undefined,
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

      setMessage(isDuplicateAction ? 'Marked as already imported' : 'Confirmed')
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

  if (mode === 'needsCategory') {
    return (
      <div className="space-y-2 pt-1">
        <select
          className="border rounded px-3 py-2 text-sm"
          disabled={disabled}
          onChange={(event) => setSelectedCategory(event.target.value)}
          value={selectedCategory}
        >
          <option value="">Select category</option>
          {categories.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-3">
          {selectedCategory && (
            <button
              className="border rounded px-3 py-2 text-sm font-medium disabled:opacity-60"
              disabled={disabled}
              onClick={postAction}
              type="button"
            >
              {disabled ? 'Confirming...' : 'Confirm'}
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
            ? 'Mark as already imported'
            : 'Confirm'}
      </button>

      {message && <p className="text-sm opacity-70">{message}</p>}
    </div>
  )
}
