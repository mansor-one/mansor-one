import { requireUser } from '@/lib/auth/requireUser'
import {
  getLedgerSummary,
  transactionContext,
  type ConfirmedLedgerDuplicateGroup,
  type LedgerSummaryTransaction,
} from '@/lib/financial-engine'
import Link from 'next/link'
import type { Metadata } from 'next'
import Nav from '../../components/Nav'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Confirmed Ledger Duplicates | Mansor One',
}

type PageProps = {
  searchParams?: Promise<{
    resolved?: string
    error?: string
  }>
}

function money(value: number) {
  return `$${Math.abs(Number(value || 0)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function displayDate(value: string | null) {
  return value || 'No date'
}

function createdAt(transaction: LedgerSummaryTransaction) {
  const value = transaction.metadata.createdAt
  return typeof value === 'string' ? value : null
}

function plaidAccountId(transaction: LedgerSummaryTransaction) {
  const value = transaction.metadata.plaidAccountId
  return typeof value === 'string' ? value : null
}

function accountLabel(transaction: LedgerSummaryTransaction) {
  const context = transactionContext(transaction)
  return `${context.institution} / ${context.accountLabel}`
}

function ResolutionForm({
  action,
  duplicate,
  group,
  label,
}: {
  action: 'mark_duplicate' | 'keep_separate'
  duplicate: LedgerSummaryTransaction
  group: ConfirmedLedgerDuplicateGroup
  label: string
}) {
  return (
    <form action="/api/ledger/duplicate-resolution" method="post">
      <input name="action" type="hidden" value={action} />
      <input
        name="duplicateQuickEntryId"
        type="hidden"
        value={duplicate.id}
      />
      <input
        name="survivorQuickEntryId"
        type="hidden"
        value={group.survivor.id}
      />
      <input name="fingerprint" type="hidden" value={group.fingerprint} />
      <input
        name="reason"
        type="hidden"
        value={
          action === 'mark_duplicate'
            ? 'Reviewed as an exact duplicate from confirmed ledger duplicate review.'
            : 'Reviewed as a legitimate separate movement from confirmed ledger duplicate review.'
        }
      />
      <input
        name="redirectTo"
        type="hidden"
        value="/dev/confirmed-ledger-duplicates"
      />
      <button
        className={`rounded border px-3 py-2 text-sm ${
          action === 'mark_duplicate'
            ? 'border-red-200 bg-red-50 text-red-900'
            : 'border-slate-200 bg-white'
        }`}
        type="submit"
      >
        {label}
      </button>
    </form>
  )
}

function CandidateGroupCard({ group }: { group: ConfirmedLedgerDuplicateGroup }) {
  return (
    <section className="rounded border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">
            {group.survivor.description || 'Movimiento duplicado'}
          </h2>
          <p className="text-sm text-slate-600">
            {displayDate(group.survivor.date)} · {money(group.survivor.amount)} ·{' '}
            {accountLabel(group.survivor)}
          </p>
          <p className="max-w-4xl break-all text-xs text-slate-500">
            {group.fingerprint}
          </p>
        </div>
        <div className="rounded border bg-slate-50 px-3 py-2 text-sm">
          Suggested survivor:{' '}
          <span className="font-mono">{group.survivor.id}</span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3">Quick entry</th>
              <th className="py-2 pr-3">Plaid transaction</th>
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Amount</th>
              <th className="py-2 pr-3">Category</th>
              <th className="py-2 pr-3">Account</th>
              <th className="py-2 pr-3">Created</th>
              <th className="py-2 pr-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {group.entries.map(({ transaction, resolution }) => {
              const isSurvivor = transaction.id === group.survivor.id

              return (
                <tr key={transaction.id}>
                  <td className="py-3 pr-3">
                    {isSurvivor ? (
                      <span className="rounded bg-green-50 px-2 py-1 text-xs text-green-900">
                        Survivor
                      </span>
                    ) : (
                      <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
                        Candidate
                      </span>
                    )}
                    {resolution && (
                      <p className="mt-1 text-xs text-slate-500">
                        {resolution.resolutionType}
                      </p>
                    )}
                  </td>
                  <td className="py-3 pr-3 font-mono text-xs">
                    {transaction.id}
                  </td>
                  <td className="py-3 pr-3 font-mono text-xs">
                    {transaction.plaidTransactionId || 'None'}
                    <br />
                    <span className="text-slate-500">
                      acct {plaidAccountId(transaction) || 'unknown'}
                    </span>
                  </td>
                  <td className="py-3 pr-3">{displayDate(transaction.date)}</td>
                  <td className="py-3 pr-3 font-semibold">
                    {money(transaction.amount)}
                  </td>
                  <td className="py-3 pr-3">
                    {transaction.category || 'Uncategorized'}
                  </td>
                  <td className="py-3 pr-3">{accountLabel(transaction)}</td>
                  <td className="py-3 pr-3 text-xs">
                    {createdAt(transaction) || 'Unknown'}
                  </td>
                  <td className="py-3 pr-3">
                    {isSurvivor || resolution ? (
                      <span className="text-xs text-slate-500">No action</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <ResolutionForm
                          action="mark_duplicate"
                          duplicate={transaction}
                          group={group}
                          label="Mark duplicate"
                        />
                        <ResolutionForm
                          action="keep_separate"
                          duplicate={transaction}
                          group={group}
                          label="Keep both"
                        />
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 rounded bg-slate-50 p-3 text-sm text-slate-700">
        <p className="font-semibold">Why this group appears</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {group.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default async function ConfirmedLedgerDuplicatesPage({
  searchParams,
}: PageProps) {
  const { supabase, user } = await requireUser()
  const params = await searchParams
  const ledgerSummary = await getLedgerSummary(supabase, user.id)
  const candidateGroups = ledgerSummary.confirmedLedgerDuplicateGroups
  const duplicateAmount = candidateGroups.reduce(
    (sum, group) => sum + group.duplicateAmount,
    0
  )

  return (
    <main className="space-y-6 bg-slate-50 p-4 text-slate-950 md:p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">
          Confirmed ledger duplicate review
        </h1>
        <p className="max-w-4xl text-sm text-slate-600">
          Review confirmed quick_entries that share the same logical movement
          fingerprint. Actions record reversible resolution rows and do not
          delete or edit the original ledger.
        </p>
      </div>

      <Nav />

      {params?.resolved && (
        <section className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          Resolution recorded. The original quick entry remains preserved.
        </section>
      )}
      {params?.error && (
        <section className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          The resolution was not recorded. Refresh and review the group again.
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded border bg-white p-4">
          <p className="text-sm text-slate-600">Candidate groups</p>
          <p className="text-3xl font-bold">{candidateGroups.length}</p>
        </div>
        <div className="rounded border bg-white p-4">
          <p className="text-sm text-slate-600">Candidate rows</p>
          <p className="text-3xl font-bold">
            {candidateGroups.reduce(
              (sum, group) => sum + group.entries.length,
              0
            )}
          </p>
        </div>
        <div className="rounded border bg-white p-4">
          <p className="text-sm text-slate-600">Potential duplicate amount</p>
          <p className="text-3xl font-bold">{money(duplicateAmount)}</p>
        </div>
        <div className="rounded border bg-white p-4">
          <p className="text-sm text-slate-600">Resolved historical rows</p>
          <p className="text-3xl font-bold">
            {ledgerSummary.duplicateResolvedLedgerEntries.length}
          </p>
        </div>
      </section>

      <section className="rounded border bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold">June 2026 audit report</h2>
            <p className="text-sm text-slate-600">
              The SQL report is review-only and does not mark any rows.
            </p>
          </div>
          <Link
            className="rounded border px-3 py-2 text-sm"
            href="/history?month=6&year=2026"
          >
            Open History
          </Link>
        </div>
      </section>

      {candidateGroups.length === 0 ? (
        <section className="rounded border bg-white p-8 text-center">
          <h2 className="text-xl font-bold">No unresolved duplicate groups</h2>
          <p className="mt-2 text-sm text-slate-600">
            Active confirmed ledger rows do not currently share an unresolved
            duplicate fingerprint.
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {candidateGroups.map((group) => (
            <CandidateGroupCard group={group} key={group.fingerprint} />
          ))}
        </div>
      )}
    </main>
  )
}
