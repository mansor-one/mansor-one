'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type {
  LedgerDuplicateCandidate,
  LedgerSummary,
  LedgerSummaryTransaction,
} from '@/lib/financial-engine'

function money(value: number) {
  return Number(value || 0).toLocaleString()
}

function metadataText(
  transaction: LedgerSummaryTransaction,
  key: string,
  fallback: string
) {
  const value = transaction.metadata[key]
  return typeof value === 'string' && value.trim() ? value : fallback
}

function TransactionCard({
  transaction,
  showImportButton = false,
  onImport,
}: {
  transaction: LedgerSummaryTransaction
  showImportButton?: boolean
  onImport?: (id: string) => void
}) {
  const institution = metadataText(
    transaction,
    'institutionName',
    'Banco desconocido'
  )
  const accountName = metadataText(
    transaction,
    'accountName',
    'Cuenta desconocida'
  )
  const plaidCategory = metadataText(transaction, 'plaidCategory', 'N/A')

  return (
    <div className="border rounded p-4 space-y-1">
      <h3 className="font-bold">
        {transaction.description || 'Transacción Plaid'}
      </h3>

      <div className="text-sm text-gray-500 space-y-1">
        <p>
          🏦 <strong>{institution}</strong>
        </p>

        <p>💳 {accountName}</p>
      </div>

      <p className="text-sm opacity-70">
        {institution} · {accountName}
      </p>

      <p>Fecha: {transaction.date || 'N/A'}</p>

      <p>Monto: ${money(transaction.amount)}</p>

      <p>Categoría Plaid: {plaidCategory}</p>

      <p>
        Categoría Mansor sugerida:{' '}
        {transaction.category || 'Revisar'}
      </p>

      <p>
        Estado: {transaction.imported ? 'Importada' : 'Pendiente'}
      </p>

      {showImportButton && onImport && (
        <button
          className="border rounded p-2 mt-2"
          onClick={() => onImport(transaction.id)}
        >
          Importar
        </button>
      )}
    </div>
  )
}

function DuplicateCard({
  candidate,
}: {
  candidate: LedgerDuplicateCandidate
}) {
  const match = candidate.bestDuplicateMatch

  return (
    <div className="border rounded p-4 space-y-1">
      <h3 className="font-bold">
        {candidate.importCandidate.description || 'Transacción Plaid'}
      </h3>
      <p>
        Posible duplicado:{' '}
        {match.confirmedLedgerEntry.description || 'Movimiento confirmado'}
      </p>
      <p>Monto: ${money(candidate.importCandidate.amount)}</p>
      <p>Tipo de coincidencia: {match.matchType}</p>
      <p>Confianza: {match.confidence}%</p>
      <p>
        Diferencia de fecha:{' '}
        {match.dateDifferenceDays === null
          ? 'N/A'
          : `${match.dateDifferenceDays} día(s)`}
      </p>
    </div>
  )
}

export default function PlaidImportClient({
  summary,
}: {
  summary: LedgerSummary
}) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  async function refreshQueue() {
    startTransition(() => {
      router.refresh()
    })
  }

  async function syncPlaid() {
    setMessage('Sincronizando Plaid...')

    const response = await fetch('/api/plaid/sync-imports', {
      method: 'POST',
    })

    const data = await response.json()

    if (data.error) {
      setMessage(data.error)
      return
    }

    setMessage(
      `Sincronización completada. Transacciones recibidas: ${data.imported_count}`
    )
    await refreshQueue()
  }

  async function importTransaction(id: string) {
    setMessage('Importando transacción...')

    const response = await fetch('/api/plaid/import-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })

    const data = await response.json()

    if (data.error) {
      setMessage(data.error)
      return
    }

    setMessage('Transacción importada correctamente ✅')
    await refreshQueue()
  }

  async function importAllKnown() {
    setMessage('Importando transacciones conocidas...')

    const known = summary.importCandidates.filter(
      (item) => {
        const suggestedCategory = item.metadata.suggestedCategory

        return (
          typeof suggestedCategory === 'string' &&
          suggestedCategory.trim() !== '' &&
          suggestedCategory !== 'Revisar'
        )
      }
    )

    for (const item of known) {
      await fetch('/api/plaid/import-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
    }

    setMessage(`Importadas ${known.length} transacciones conocidas ✅`)
    await refreshQueue()
  }

  const importCandidates = summary.importCandidates
  const importedSourceRows = summary.importedSourceRows
  const duplicateCandidates = summary.duplicateCandidates
  const importReviewCandidates = summary.importReviewCandidates
  const athReviewCandidates = summary.athReviewCandidates

  return (
    <>
      <div className="space-x-2">
        <button
          className="border rounded p-3"
          onClick={syncPlaid}
        >
          🔄 Sincronizar Plaid
        </button>

        <button
          className="border rounded p-3"
          onClick={importAllKnown}
        >
          Importar Todo Conocido
        </button>
      </div>

      {message && (
        <div className="border rounded p-4">
          {message}
        </div>
      )}

      {isPending && (
        <div className="border rounded p-4">
          Actualizando cola de importación...
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Pendientes</h2>
          <p className="text-3xl font-bold">{importCandidates.length}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Importadas</h2>
          <p className="text-3xl font-bold">{importedSourceRows.length}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Posibles duplicados</h2>
          <p className="text-3xl font-bold">{duplicateCandidates.length}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">ATH por revisar</h2>
          <p className="text-3xl font-bold">{athReviewCandidates.length}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Pending import candidates</h2>

        {importCandidates.map((item) => (
          <TransactionCard
            key={item.id}
            transaction={item}
            showImportButton
            onImport={importTransaction}
          />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Already imported source rows</h2>

        {importedSourceRows.map((item) => (
          <TransactionCard key={item.id} transaction={item} />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Possible duplicates</h2>

        {duplicateCandidates.map((candidate) => (
          <DuplicateCard
            key={`${candidate.importCandidate.id}:${candidate.bestDuplicateMatch.confirmedLedgerEntry.id}`}
            candidate={candidate}
          />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">ATH review candidates</h2>

        {athReviewCandidates.map((item) => (
          <TransactionCard key={item.id} transaction={item} />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Import review candidates</h2>

        {importReviewCandidates.map((item) => (
          <TransactionCard key={item.id} transaction={item} />
        ))}
      </section>
    </>
  )
}
