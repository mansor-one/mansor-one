'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type PlaidSyncActionsProps = {
  lastAccountSync: string | null
  lastTransactionDate: string | null
  pendingImportCount: number
}

type SyncResult = {
  synced_accounts?: number
  imported_count?: number
  transactions_returned_by_plaid?: number
  new_imports_created?: number
  pending_imports_from_sync?: number
  account_context_backfilled?: number
  already_confirmed_imports_cleaned?: number
  failed_connections?: Array<{
    institution_name?: string | null
    error_code?: string
    error_message?: string
  }>
  error?: string
}

function formatDate(value: string | null) {
  if (!value) return 'Sin dato'

  return new Date(value).toLocaleString('es-PR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

async function postJson(url: string): Promise<SyncResult> {
  const response = await fetch(url, { method: 'POST' })
  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'No se pudo completar la sincronización.')
  }

  return result
}

function summaryText(accounts: SyncResult | null, transactions: SyncResult | null) {
  const parts: string[] = []

  if (accounts) {
    parts.push(`${accounts.synced_accounts ?? 0} cuenta(s) actualizada(s)`)
  }

  if (transactions) {
    parts.push(
      `${transactions.transactions_returned_by_plaid ?? transactions.imported_count ?? 0} transacción(es) devuelta(s) por Plaid`
    )
    parts.push(
      `${transactions.new_imports_created ?? 0} import nuevo(s)`
    )
    parts.push(
      `${transactions.pending_imports_from_sync ?? 0} pendiente(s) para Review Queue`
    )

    if (transactions.already_confirmed_imports_cleaned) {
      parts.push(
        `${transactions.already_confirmed_imports_cleaned} ya confirmada(s) limpiada(s)`
      )
    }

    if (transactions.account_context_backfilled) {
      parts.push(
        `${transactions.account_context_backfilled} contexto(s) de cuenta completado(s)`
      )
    }
  }

  return parts.join(' · ')
}

export default function PlaidSyncActions({
  lastAccountSync,
  lastTransactionDate,
  pendingImportCount,
}: PlaidSyncActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  function refresh(messageText: string) {
    setMessage(messageText)
    startTransition(() => router.refresh())
  }

  async function syncAccounts() {
    setLoading('accounts')
    setMessage('Actualizando cuentas...')

    try {
      const result = await postJson('/api/plaid/sync-accounts')
      refresh(summaryText(result, null) || 'Cuentas actualizadas.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo sincronizar.')
    } finally {
      setLoading(null)
    }
  }

  async function syncTransactions() {
    setLoading('transactions')
    setMessage('Actualizando cuentas antes de buscar movimientos...')

    try {
      const accounts = await postJson('/api/plaid/sync-accounts')
      setMessage('Buscando movimientos nuevos...')
      const transactions = await postJson('/api/plaid/sync-imports')
      refresh(summaryText(accounts, transactions))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo sincronizar.')
    } finally {
      setLoading(null)
    }
  }

  const busy = Boolean(loading) || isPending

  return (
    <section className="rounded border border-neutral-800 bg-neutral-900 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-neutral-400">Sincronización</p>
          <h2 className="text-xl font-bold text-neutral-100">
            Actualizar bancos y movimientos
          </h2>
          <p className="text-sm text-neutral-400">
            La sincronización solo actualiza cuentas Plaid y candidatos de
            movimientos. El historial se confirma desde Review Queue.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={syncAccounts}
            type="button"
          >
            {loading === 'accounts' ? 'Actualizando...' : 'Sync accounts'}
          </button>
          <button
            className="rounded border border-sky-700 bg-sky-950/40 px-4 py-2 text-sm text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={syncTransactions}
            type="button"
          >
            {loading === 'transactions' ? 'Sincronizando...' : 'Sync transactions'}
          </button>
          <button
            className="rounded border border-emerald-700 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={syncTransactions}
            type="button"
          >
            Sync now
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
        <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
          <p className="text-neutral-500">Último sync de cuentas</p>
          <p className="mt-1 text-neutral-200">{formatDate(lastAccountSync)}</p>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
          <p className="text-neutral-500">Movimiento Plaid más reciente</p>
          <p className="mt-1 text-neutral-200">{formatDate(lastTransactionDate)}</p>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
          <p className="text-neutral-500">Pendientes en Review Queue</p>
          <p className="mt-1 text-neutral-200">{pendingImportCount}</p>
        </div>
      </div>

      {message && (
        <p className="mt-4 rounded border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-200">
          {message}
        </p>
      )}
    </section>
  )
}
