import { requireUser } from '@/lib/auth/requireUser'
import {
  type LedgerDuplicateCandidate,
  type LedgerSummaryTransaction,
  getLedgerSummary,
} from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function money(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function TransactionList({
  title,
  transactions,
}: {
  title: string
  transactions: LedgerSummaryTransaction[]
}) {
  return (
    <section className="border rounded p-4 space-y-3">
      <h2 className="text-xl font-bold">{title}</h2>

      <div className="space-y-2">
        {transactions.slice(0, 25).map((transaction) => (
          <div
            className="border rounded p-3 text-sm"
            key={`${transaction.sourceTable}:${transaction.id}`}
          >
            <h3 className="font-semibold">
              {transaction.description || 'No description'}
            </h3>
            <p>
              {transaction.date || 'No date'} / ${money(transaction.amount)} /{' '}
              {transaction.category || 'No category'}
            </p>
            <p className="opacity-70">
              {transaction.sourceTable} / {transaction.source || 'unknown'}
              {transaction.plaidTransactionId
                ? ` / ${transaction.plaidTransactionId}`
                : ''}
            </p>
          </div>
        ))}

        {transactions.length === 0 && (
          <p className="opacity-70">No transactions.</p>
        )}

        {transactions.length > 25 && (
          <p className="text-sm opacity-70">
            Showing 25 of {transactions.length}.
          </p>
        )}
      </div>
    </section>
  )
}

function DuplicateList({
  duplicates,
}: {
  duplicates: LedgerDuplicateCandidate[]
}) {
  return (
    <section className="border rounded p-4 space-y-3">
      <h2 className="text-xl font-bold">Best duplicate matches</h2>

      <div className="space-y-3">
        {duplicates.map((candidate) => {
          const match = candidate.bestDuplicateMatch

          return (
            <div
              className="border rounded p-3 space-y-2 text-sm"
              key={`${candidate.importCandidate.id}:${match.confirmedLedgerEntry.id}`}
            >
              <h3 className="font-semibold">
                {candidate.importCandidate.description || 'Plaid import'} {'->'}{' '}
                {match.confirmedLedgerEntry.description || 'Confirmed ledger'}
              </h3>
              <p>
                ${money(candidate.importCandidate.amount)} /{' '}
                {match.matchType} / {match.confidence}% confidence
              </p>
              <p>
                Date difference:{' '}
                {match.dateDifferenceDays === null
                  ? 'unknown'
                  : `${match.dateDifferenceDays} day(s)`}
              </p>
              <p className="opacity-70">
                {match.normalizedImportDescription} /{' '}
                {match.normalizedLedgerDescription}
              </p>
              <p className="opacity-70">
                Alternative matches: {candidate.alternativeMatches.length}
              </p>
              <ul className="list-disc pl-5">
                {match.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )
        })}

        {duplicates.length === 0 && (
          <p className="opacity-70">No duplicate candidates found.</p>
        )}
      </div>
    </section>
  )
}

export default async function LabLedgerSummaryPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const summary = await getLedgerSummary(supabase, user.id)

  const counts = [
    {
      label: 'confirmedLedgerEntries',
      value: summary.confirmedLedgerEntries.length,
    },
    { label: 'manualLedgerEntries', value: summary.manualLedgerEntries.length },
    { label: 'plaidLedgerEntries', value: summary.plaidLedgerEntries.length },
    { label: 'importCandidates', value: summary.importCandidates.length },
    { label: 'importedSourceRows', value: summary.importedSourceRows.length },
    { label: 'duplicateCandidates', value: summary.duplicateCandidates.length },
    {
      label: 'ledgerReviewCandidates',
      value: summary.ledgerReviewCandidates.length,
    },
    {
      label: 'importReviewCandidates',
      value: summary.importReviewCandidates.length,
    },
    { label: 'athReviewCandidates', value: summary.athReviewCandidates.length },
  ]

  const amounts = [
    { label: 'confirmedLedgerAmount', value: summary.confirmedLedgerAmount },
    { label: 'manualLedgerAmount', value: summary.manualLedgerAmount },
    { label: 'plaidLedgerAmount', value: summary.plaidLedgerAmount },
    { label: 'importCandidateAmount', value: summary.importCandidateAmount },
    { label: 'reviewCandidateAmount', value: summary.reviewCandidateAmount },
  ]

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Lab Ledger Summary</h1>
        <p className="text-sm opacity-70">
          Read-only validation page for confirmed ledger entries, Plaid import
          candidates, imported source rows, review queues, and duplicate
          candidates.
        </p>
      </div>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Counts</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {counts.map((count) => (
            <div className="border rounded p-3" key={count.label}>
              <h3 className="font-semibold">{count.label}</h3>
              <p className="text-3xl font-bold">{count.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Totals</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {amounts.map((amount) => (
            <div className="border rounded p-3" key={amount.label}>
              <h3 className="font-semibold">{amount.label}</h3>
              <p className="text-3xl font-bold">${money(amount.value)}</p>
              <p className="text-xs opacity-70">{amount.value}</p>
            </div>
          ))}
        </div>
      </section>

      <DuplicateList duplicates={summary.duplicateCandidates} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TransactionList
          title="Ledger review candidates"
          transactions={summary.ledgerReviewCandidates}
        />
        <TransactionList
          title="Import review candidates"
          transactions={summary.importReviewCandidates}
        />
        <TransactionList
          title="ATH review candidates"
          transactions={summary.athReviewCandidates}
        />
        <TransactionList
          title="Import candidates"
          transactions={summary.importCandidates}
        />
        <TransactionList
          title="Imported source rows"
          transactions={summary.importedSourceRows}
        />
        <TransactionList
          title="Confirmed ledger entries"
          transactions={summary.confirmedLedgerEntries}
        />
      </div>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Raw JSON</h2>
        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(summary)}
        </pre>
      </section>
    </main>
  )
}
