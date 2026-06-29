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
      <h2 className="text-xl font-bold">Duplicate candidates</h2>

      <div className="space-y-3">
        {duplicates.map((candidate) => (
          <div
            className="border rounded p-3 space-y-2 text-sm"
            key={`${candidate.importedTransaction.id}:${candidate.manualTransaction.id}`}
          >
            <h3 className="font-semibold">
              {candidate.importedTransaction.description || 'Plaid import'} {'->'}{' '}
              {candidate.manualTransaction.description || 'Quick entry'}
            </h3>
            <p>
              Amount: ${money(candidate.importedTransaction.amount)} / Date
              difference: {candidate.dateDifferenceDays} day(s)
            </p>
            <p className="opacity-70">
              {candidate.normalizedImportedDescription} /{' '}
              {candidate.normalizedManualDescription}
            </p>
            <ul className="list-disc pl-5">
              {candidate.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ))}

        {duplicates.length === 0 && (
          <p className="opacity-70">No duplicate candidates found.</p>
        )}
      </div>
    </section>
  )
}

export default async function DevLedgerSummaryPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const summary = await getLedgerSummary(supabase, user.id)

  const totals = [
    { label: 'totalImported', value: summary.totalImported },
    { label: 'totalManual', value: summary.totalManual },
    { label: 'totalTransactions', value: summary.totalTransactions },
    { label: 'duplicateCandidates', value: summary.duplicateCandidates.length },
    {
      label: 'uncategorizedTransactions',
      value: summary.uncategorizedTransactions.length,
    },
    { label: 'reviewCandidates', value: summary.reviewCandidates.length },
  ]

  const amounts = [
    { label: 'importedAmount', value: summary.importedAmount },
    { label: 'manualAmount', value: summary.manualAmount },
    { label: 'totalAmount', value: summary.totalAmount },
  ]

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dev Ledger Summary</h1>
        <p className="text-sm opacity-70">
          Read-only validation page for comparing Plaid import candidates and
          current quick_entries ledger rows.
        </p>
      </div>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Counts</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {totals.map((total) => (
            <div className="border rounded p-3" key={total.label}>
              <h3 className="font-semibold">{total.label}</h3>
              <p className="text-3xl font-bold">{total.value}</p>
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
          title="Uncategorized"
          transactions={summary.uncategorizedTransactions}
        />
        <TransactionList
          title="Review queue"
          transactions={summary.reviewCandidates}
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
