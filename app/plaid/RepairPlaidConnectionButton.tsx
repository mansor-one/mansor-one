'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePlaidLink } from 'react-plaid-link'
import { plaidRepairMessage } from '@/lib/plaid/connection-health'

export default function RepairPlaidConnectionButton({
  connectionId,
  institution,
  syncPending = false,
}: {
  connectionId: string
  institution: string
  syncPending?: boolean
}) {
  const router = useRouter()
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [launchWhenReady, setLaunchWhenReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const openedToken = useRef<string | null>(null)

  async function completeRepair(
    completionSource: 'link_on_success' | 'sync_retry'
  ) {
    setLaunchWhenReady(false)
    setLoading(true)
    setMessage('Verificando la conexión y actualizando movimientos…')

    try {
      const response = await fetch('/api/plaid/complete-update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connectionId, completionSource }),
      })
      const result = (await response.json()) as {
        ok?: boolean
        state?:
          | 'repair_and_sync_completed'
          | 'repair_completed_processing'
          | 'repair_credentials_required'
          | 'sync_retryable_failure'
        message?: string
      }

      if (result.state !== 'repair_and_sync_completed') {
        setMessage(result.message || 'La sincronización necesita otro intento.')
        router.refresh()
        return
      }

      setMessage(
        result.message || 'Conexión reparada y sincronizada correctamente.'
      )
      setLinkToken(null)
      router.refresh()
    } catch {
      setMessage(
        'La conexión se actualizó, pero la sincronización necesita otro intento.'
      )
    } finally {
      setLoading(false)
    }
  }

  const { open, ready } = usePlaidLink({
    token: linkToken || '',
    onSuccess: async () => {
      await completeRepair('link_on_success')
    },
    onExit: () => {
      setLoading(false)
      setLaunchWhenReady(false)
    },
  })

  useEffect(() => {
    if (!launchWhenReady || !ready || !linkToken) return
    if (openedToken.current === linkToken) return
    openedToken.current = linkToken
    open()
  }, [launchWhenReady, linkToken, open, ready])

  async function startRepair() {
    setLoading(true)
    setMessage(null)

    if (syncPending) {
      await completeRepair('sync_retry')
      return
    }

    try {
      const response = await fetch('/api/plaid/update-link-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      })
      const result = (await response.json()) as {
        link_token?: string
        error?: string
      }

      if (!response.ok || !result.link_token) {
        setMessage(
          result.error || 'No pudimos iniciar la reparación de la conexión.'
        )
        setLoading(false)
        return
      }

      setLinkToken(result.link_token)
      setLaunchWhenReady(true)
    } catch {
      setMessage('No pudimos iniciar la reparación de la conexión.')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3 rounded border border-amber-800 bg-amber-950/30 p-4">
      <p className="text-sm text-amber-100">
        {syncPending
          ? 'La conexión ya fue reparada. Falta completar la actualización de cuentas y movimientos.'
          : plaidRepairMessage(institution)}
      </p>
      <button
        className="rounded border border-amber-600 bg-amber-950 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={loading || launchWhenReady}
        onClick={startRepair}
        type="button"
      >
        {loading || launchWhenReady
          ? 'Preparando conexión…'
          : syncPending
            ? 'Reintentar sincronización'
            : 'Reparar conexión'}
      </button>
      {message && (
        <p className="text-sm text-neutral-200" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
