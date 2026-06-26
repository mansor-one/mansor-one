'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type SyncResponse = {
  synced_accounts?: number
  failed_connections?: unknown[]
  error?: string
  [key: string]: unknown
}

export default function SyncPlaidAccountsButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<SyncResponse | null>(null)

  async function syncPlaidAccounts() {
    setLoading(true)
    setResponse(null)

    try {
      const result = await fetch('/api/plaid/sync-accounts', {
        method: 'POST',
      })

      const json = (await result.json()) as SyncResponse
      setResponse(json)

      if (result.ok) {
        router.refresh()
      }
    } catch (error) {
      setResponse({
        error: error instanceof Error ? error.message : 'Unexpected error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="border rounded p-4 space-y-4">
      <button
        className="border rounded px-4 py-2 font-semibold disabled:opacity-50"
        disabled={loading}
        onClick={syncPlaidAccounts}
        type="button"
      >
        {loading ? 'Syncing...' : 'Sync Plaid Accounts'}
      </button>

      {response && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded p-3">
              <h2 className="font-semibold">synced_accounts</h2>
              <p className="text-2xl font-bold">
                {String(response.synced_accounts ?? 'N/A')}
              </p>
            </div>

            <div className="border rounded p-3">
              <h2 className="font-semibold">failed_connections</h2>
              <pre className="text-sm whitespace-pre-wrap">
                {JSON.stringify(response.failed_connections ?? [], null, 2)}
              </pre>
            </div>
          </div>

          <div>
            <h2 className="font-semibold">Raw JSON response</h2>
            <pre className="border rounded p-3 text-sm overflow-auto">
              {JSON.stringify(response, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </section>
  )
}
