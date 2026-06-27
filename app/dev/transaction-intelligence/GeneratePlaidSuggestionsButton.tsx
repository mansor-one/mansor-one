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

export default function GeneratePlaidSuggestionsButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)

  async function generateSuggestions() {
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch(
        '/api/dev/transaction-intelligence/generate-plaid-suggestions',
        { method: 'POST' }
      )
      const data = (await response.json()) as GenerateResult
      setResult(data)

      if (response.ok && data.success) {
        router.refresh()
      }
    } catch (error) {
      setResult({
        error:
          error instanceof Error
            ? error.message
            : 'Could not generate suggestions',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="border rounded p-4 space-y-3">
      <div>
        <h2 className="text-xl font-bold">Generate Plaid suggestions</h2>
        <p className="text-sm opacity-70">
          Creates suggestions from unimported Plaid imports without changing
          quick_entries.
        </p>
      </div>

      <button
        className="border rounded p-3"
        disabled={loading}
        onClick={generateSuggestions}
      >
        {loading ? 'Generating...' : 'Generate Plaid suggestions'}
      </button>

      {result && (
        <pre className="border rounded p-3 text-sm overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </section>
  )
}
