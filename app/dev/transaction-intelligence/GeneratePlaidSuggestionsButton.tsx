'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type GenerateResult = {
  success?: boolean
  error?: string
  scannedPlaidImports?: number
  createdSuggestions?: number
  skippedSuggestions?: number
  createdReviewItems?: number
  skippedReviewItems?: number
}

type RecategorizeResult = {
  success?: boolean
  error?: string
  scannedSuggestions?: number
  missingPlaidImports?: number
  unchangedSuggestions?: number
  updatedSuggestions?: number
  ignoredReviewItems?: number
  createdReviewItems?: number
  skippedReviewItems?: number
}

export default function GeneratePlaidSuggestionsButton() {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)
  const [recategorizing, setRecategorizing] = useState(false)
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(
    null
  )
  const [recategorizeResult, setRecategorizeResult] =
    useState<RecategorizeResult | null>(null)

  async function generateSuggestions() {
    setGenerating(true)
    setGenerateResult(null)

    try {
      const response = await fetch(
        '/api/dev/transaction-intelligence/generate-plaid-suggestions',
        { method: 'POST' }
      )
      const data = (await response.json()) as GenerateResult
      setGenerateResult(data)

      if (response.ok && data.success) {
        router.refresh()
      }
    } catch (error) {
      setGenerateResult({
        error:
          error instanceof Error
            ? error.message
            : 'Could not generate suggestions',
      })
    } finally {
      setGenerating(false)
    }
  }

  async function recategorizeSuggestions() {
    setRecategorizing(true)
    setRecategorizeResult(null)

    try {
      const response = await fetch(
        '/api/dev/transaction-intelligence/recategorize-plaid-suggestions',
        { method: 'POST' }
      )
      const data = (await response.json()) as RecategorizeResult
      setRecategorizeResult(data)

      if (response.ok && data.success) {
        router.refresh()
      }
    } catch (error) {
      setRecategorizeResult({
        error:
          error instanceof Error
            ? error.message
            : 'Could not recalculate suggestions',
      })
    } finally {
      setRecategorizing(false)
    }
  }

  return (
    <section className="border rounded p-4 space-y-6">
      <div>
        <h2 className="text-xl font-bold">Generate Plaid suggestions</h2>
        <p className="text-sm opacity-70">
          Creates suggestions from unimported Plaid imports without changing
          quick_entries.
        </p>
      </div>

      <button
        className="border rounded p-3"
        disabled={generating}
        onClick={generateSuggestions}
      >
        {generating ? 'Generating...' : 'Generate Plaid suggestions'}
      </button>

      {generateResult && (
        <pre className="border rounded p-3 text-sm overflow-auto">
          {JSON.stringify(generateResult, null, 2)}
        </pre>
      )}

      <div className="border-t pt-4 space-y-3">
        <div>
          <h2 className="text-xl font-bold">
            Recalculate Plaid suggestions
          </h2>
          <p className="text-sm opacity-70">
            Re-runs categorizeTransaction against existing Plaid suggestions
            without changing quick_entries.
          </p>
        </div>

        <button
          className="border rounded p-3"
          disabled={recategorizing}
          onClick={recategorizeSuggestions}
        >
          {recategorizing
            ? 'Recalculating...'
            : 'Recalculate Plaid suggestions'}
        </button>
      </div>

      {recategorizeResult && (
        <pre className="border rounded p-3 text-sm overflow-auto">
          {JSON.stringify(recategorizeResult, null, 2)}
        </pre>
      )}
    </section>
  )
}
