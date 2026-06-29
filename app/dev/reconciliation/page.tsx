import { requireUser } from '@/lib/auth/requireUser'
import {
  buildReconciliationMatches,
  type ReconciliationPaymentInstance,
  type ReconciliationTransaction,
} from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type PlaidImportRow = {
  id: string
  merchant: string | null
  amount: number | string | null
  plaid_category: string | null
  transaction_date: string | null
}

type QuickEntryRow = {
  id: string
  description: string | null
  amount: number | string | null
  entry_date: string | null
}

type PaymentInstanceRow = {
  id: string
  name: string | null
  amount: number | string | null
  status: string | null
  effective_due_date: string | null
  updated_at: string | null
  notes: string | null
  scheduled_payment_id: string | null
}

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function money(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function transactionFromPlaid(row: PlaidImportRow): ReconciliationTransaction | null {
  const name = row.merchant || row.plaid_category

  if (!name || !row.transaction_date) return null

  return {
    source: 'plaid_imports',
    id: row.id,
    name,
    amount: Number(row.amount || 0),
    date: row.transaction_date,
  }
}

function transactionFromQuickEntry(
  row: QuickEntryRow
): ReconciliationTransaction | null {
  if (!row.description || !row.entry_date) return null

  return {
    source: 'quick_entries',
    id: row.id,
    name: row.description,
    amount: Number(row.amount || 0),
    date: row.entry_date,
  }
}

function paymentFromRow(row: PaymentInstanceRow): ReconciliationPaymentInstance {
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount || 0),
    status: row.status,
    effective_due_date: row.effective_due_date,
    updated_at: row.updated_at,
    notes: row.notes,
    scheduled_payment_id: row.scheduled_payment_id,
  }
}

function MatchList({
  title,
  matches,
}: {
  title: string
  matches: ReturnType<typeof buildReconciliationMatches>['allMatches']
}) {
  return (
    <section className="border rounded p-4 space-y-3">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="space-y-3">
        {matches.map((match) => (
          <div
            className="border rounded p-3 space-y-2"
            key={`${match.paymentInstanceId}:${match.transactionSource}:${match.transactionId}`}
          >
            <div>
              <h3 className="font-semibold">
                {match.paymentName || 'Payment'} {'->'}{' '}
                {match.transactionName || 'Transaction'}
              </h3>
              <p className="text-sm opacity-70">
                {match.confidence}% · {match.confidenceLevel} ·{' '}
                {match.transactionSource}
              </p>
            </div>
            <p>
              Payment: ${money(match.paymentAmount)} · {match.paymentStatus}
            </p>
            <p>
              Transaction: ${money(match.transactionAmount)} ·{' '}
              {match.transactionDate || 'No date'}
            </p>
            <p>{match.recommendedActionText}</p>
            <ul className="list-disc pl-5 text-sm">
              {match.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ))}
        {matches.length === 0 && <p className="opacity-70">No matches.</p>}
      </div>
    </section>
  )
}

export default async function DevReconciliationPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const [plaidResult, quickEntriesResult, paymentsResult] = await Promise.all([
    supabase
      .from('plaid_imports')
      .select('id, merchant, amount, plaid_category, transaction_date')
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false })
      .limit(300),
    supabase
      .from('quick_entries')
      .select('id, description, amount, entry_date')
      .eq('user_id', user.id)
      .order('entry_date', { ascending: false })
      .limit(100),
    supabase
      .from('payment_instances')
      .select(
        'id, name, amount, status, effective_due_date, updated_at, notes, scheduled_payment_id'
      )
      .eq('payment_month', month)
      .eq('payment_year', year)
      .in('status', ['pending', 'initiated'])
      .order('effective_due_date', { ascending: true }),
  ])

  const plaidTransactions =
    ((plaidResult.data || []) as PlaidImportRow[])
      .map(transactionFromPlaid)
      .filter(
        (transaction): transaction is ReconciliationTransaction =>
          Boolean(transaction)
      ) || []
  const quickEntryTransactions =
    ((quickEntriesResult.data || []) as QuickEntryRow[])
      .map(transactionFromQuickEntry)
      .filter(
        (transaction): transaction is ReconciliationTransaction =>
          Boolean(transaction)
      ) || []
  const transactions = [...plaidTransactions, ...quickEntryTransactions]
  const payments = ((paymentsResult.data || []) as PaymentInstanceRow[]).map(
    paymentFromRow
  )
  const result = buildReconciliationMatches({
    transactions,
    payments,
  })

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dev Reconciliation</h1>
        <p className="text-sm opacity-70">
          Read-only proposed matches between transactions and open payments.
        </p>
      </div>

      {(plaidResult.error || quickEntriesResult.error || paymentsResult.error) && (
        <section className="border rounded p-4 text-red-600">
          <h2 className="text-xl font-bold">Source errors</h2>
          <pre className="mt-3 overflow-auto text-sm">
            {asJson({
              plaid_imports: plaidResult.error,
              quick_entries: quickEntriesResult.error,
              payment_instances: paymentsResult.error,
            })}
          </pre>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Plaid imports</h2>
          <p className="mt-3 text-3xl font-bold">
            {plaidTransactions.length}
          </p>
        </div>
        <div className="border rounded p-4">
          <h2 className="font-semibold">Quick entries</h2>
          <p className="mt-3 text-3xl font-bold">
            {quickEntryTransactions.length}
          </p>
        </div>
        <div className="border rounded p-4">
          <h2 className="font-semibold">Open payments</h2>
          <p className="mt-3 text-3xl font-bold">{payments.length}</p>
        </div>
        <div className="border rounded p-4">
          <h2 className="font-semibold">Proposed matches</h2>
          <p className="mt-3 text-3xl font-bold">
            {result.highConfidenceMatches.length +
              result.likelyMatches.length +
              result.possibleMatches.length}
          </p>
        </div>
      </section>

      <MatchList
        title="High confidence matches"
        matches={result.highConfidenceMatches}
      />
      <MatchList title="Likely matches" matches={result.likelyMatches} />
      <MatchList title="Possible matches" matches={result.possibleMatches} />

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Unmatched initiated payments</h2>
        <div className="space-y-3">
          {result.unmatchedInitiatedPayments.map((payment) => (
            <div className="border rounded p-3" key={payment.id}>
              <h3 className="font-semibold">{payment.name || 'Payment'}</h3>
              <p>
                ${money(payment.amount)} · {payment.status} ·{' '}
                {payment.effective_due_date || 'No date'}
              </p>
              {payment.notes && <p className="text-sm">{payment.notes}</p>}
            </div>
          ))}
          {result.unmatchedInitiatedPayments.length === 0 && (
            <p className="opacity-70">No unmatched initiated payments.</p>
          )}
        </div>
      </section>

      <details className="border rounded p-4">
        <summary className="font-semibold">Raw JSON</summary>
        <pre className="mt-3 overflow-auto text-sm">
          {asJson({
            transactions,
            payments,
            result,
          })}
        </pre>
      </details>
    </main>
  )
}
