import { requireUser } from '@/lib/auth/requireUser'
import {
  buildReconciliationMatches,
  type ReconciliationPaymentInstance,
  type ReconciliationTransaction,
} from '@/lib/financial-engine'
import { buildPaymentLifecycleSnapshot } from '@/lib/finance/paymentLifecycle'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type PlaidImportRow = {
  id: string
  merchant: string | null
  amount: number | string | null
  plaid_category: string | null
  transaction_date: string | null
  institution_name?: string | null
  account_name?: string | null
  account_type?: string | null
  account_subtype?: string | null
}

type QuickEntryRow = {
  id: string
  description: string | null
  amount: number | string | null
  entry_date: string | null
  account_name?: string | null
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
    institutionName: row.institution_name || null,
    accountName: row.account_name || null,
    accountType: row.account_type || null,
    accountSubtype: row.account_subtype || null,
    category: row.plaid_category,
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
    accountName: row.account_name || null,
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
              <p>Institution: {match.transactionInstitution || 'Unknown'}</p>
              <p>Account: {match.transactionAccountName || 'Unknown'}</p>
              <p>Timeline: {match.paymentTimeline.label}</p>
              <p>
                Delta: ${money(match.amountDifference)} ·{' '}
                {match.dateDifferenceDays === null
                  ? 'Unknown date delta'
                  : `${match.dateDifferenceDays} days`}
              </p>
            </div>
            <p>{match.recommendedActionText}</p>
            <div className="text-sm">
              <p className="font-medium">Score factors</p>
              <ul className="list-disc pl-5">
                {match.scoreFactors.map((factor) => (
                  <li key={factor.code}>
                    {factor.label}: {factor.details} ({factor.score > 0 ? '+' : ''}
                    {factor.score})
                  </li>
                ))}
              </ul>
            </div>
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

function PaymentLifecycleList({
  title,
  payments,
  detectedPaymentIds,
}: {
  title: string
  payments: ReconciliationPaymentInstance[]
  detectedPaymentIds: Set<string>
}) {
  return (
    <section className="border rounded p-4 space-y-3">
      <h2 className="text-xl font-bold">
        {title} ({payments.length})
      </h2>
      <div className="space-y-3">
        {payments.map((payment) => {
          const timeline = buildPaymentLifecycleSnapshot({
            status: payment.status,
            effectiveDueDate: payment.effective_due_date,
            updatedAt: payment.updated_at,
            hasDetectedTransaction: detectedPaymentIds.has(payment.id),
          })

          return (
            <div className="border rounded p-3 space-y-1" key={payment.id}>
              <h3 className="font-semibold">{payment.name || 'Payment'}</h3>
              <p>
                ${money(payment.amount)} · {payment.status || 'unknown'} ·{' '}
                {payment.effective_due_date || 'No due date'}
              </p>
              <p>Timeline: {timeline.label}</p>
              <p>
                Due delta:{' '}
                {timeline.daysFromDueDate === null
                  ? 'Unknown'
                  : `${timeline.daysFromDueDate} days`}
              </p>
              {payment.notes && <p className="text-sm">{payment.notes}</p>}
              <ul className="list-disc pl-5 text-sm">
                {timeline.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )
        })}
        {payments.length === 0 && <p className="opacity-70">No payments.</p>}
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
      .select(
        'id, merchant, amount, plaid_category, transaction_date, institution_name, account_name, account_type, account_subtype'
      )
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false })
      .limit(300),
    supabase
      .from('quick_entries')
      .select('id, description, amount, entry_date, account_name')
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
  const detectedPaymentIds = new Set(
    result.allMatches
      .filter((match) => match.confidence >= 50)
      .map((match) => match.paymentInstanceId)
  )
  const openPayments = payments.filter((payment) =>
    ['pending', 'initiated', 'promise'].includes(String(payment.status || ''))
  )
  const waitingReconciliation = openPayments.filter(
    (payment) => !detectedPaymentIds.has(payment.id)
  )
  const recentlyConfirmed = payments.filter((payment) =>
    ['confirmed', 'paid'].includes(String(payment.status || ''))
  )

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

      <PaymentLifecycleList
        detectedPaymentIds={detectedPaymentIds}
        payments={openPayments}
        title="Open payments"
      />

      <PaymentLifecycleList
        detectedPaymentIds={detectedPaymentIds}
        payments={waitingReconciliation}
        title="Waiting reconciliation"
      />

      <PaymentLifecycleList
        detectedPaymentIds={detectedPaymentIds}
        payments={recentlyConfirmed}
        title="Recently confirmed"
      />

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
