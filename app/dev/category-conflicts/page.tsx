import { requireUser } from '@/lib/auth/requireUser'
import {
  getLedgerSummary,
  getResolvedDuplicateCategoryConflicts,
  type ResolvedDuplicateCategoryConflict,
} from '@/lib/financial-engine'
import Link from 'next/link'
import type { Metadata } from 'next'
import Nav from '../../components/Nav'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Category Conflict Review | Mansor One',
}

type PageProps = {
  searchParams?: Promise<{
    reviewed?: string
    error?: string
  }>
}

function money(value: number) {
  return `$${Math.abs(Number(value || 0)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function confidenceClass(confidence: string) {
  if (confidence === 'high') return 'border-green-200 bg-green-50 text-green-900'
  if (confidence === 'medium') return 'border-amber-200 bg-amber-50 text-amber-900'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function uniqueCategories(conflict: ResolvedDuplicateCategoryConflict) {
  const options = new Map<string, string>()

  options.set(
    conflict.suggestedCanonicalCategory.code,
    conflict.suggestedCanonicalCategory.label
  )
  options.set(
    conflict.survivorCanonicalCategoryCode,
    conflict.survivorCategory
  )
  conflict.duplicateCategories.forEach((duplicate) => {
    options.set(
      duplicate.canonicalCategoryCode,
      duplicate.canonicalCategoryLabel
    )
  })

  return [...options.entries()].map(([code, label]) => ({ code, label }))
}

function ReviewForm({
  action,
  conflict,
  label,
  categoryCode,
  reason,
  className = 'border-slate-200 bg-white',
}: {
  action: 'keep_survivor' | 'replace_survivor' | 'review_later'
  conflict: ResolvedDuplicateCategoryConflict
  label: string
  categoryCode?: string
  reason?: string
  className?: string
}) {
  return (
    <form action="/api/ledger/category-conflict" method="post">
      <input name="action" type="hidden" value={action} />
      <input
        name="survivorQuickEntryId"
        type="hidden"
        value={conflict.survivorQuickEntryId}
      />
      {categoryCode && (
        <input name="categoryCode" type="hidden" value={categoryCode} />
      )}
      <input
        name="reason"
        type="hidden"
        value={
          reason ||
          `Reviewed category conflict for ${conflict.merchant} on ${conflict.date || 'unknown date'}.`
        }
      />
      <input name="redirectTo" type="hidden" value="/dev/category-conflicts" />
      <button
        className={`rounded border px-3 py-2 text-sm ${className}`}
        type="submit"
      >
        {label}
      </button>
    </form>
  )
}

function ReplaceCategoryForm({
  conflict,
}: {
  conflict: ResolvedDuplicateCategoryConflict
}) {
  const categories = uniqueCategories(conflict)

  return (
    <form
      action="/api/ledger/category-conflict"
      className="flex flex-col gap-2 rounded border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-center"
      method="post"
    >
      <input name="action" type="hidden" value="replace_survivor" />
      <input
        name="survivorQuickEntryId"
        type="hidden"
        value={conflict.survivorQuickEntryId}
      />
      <input
        name="reason"
        type="hidden"
        value={`Canonical category chosen from resolved duplicate category conflict review for ${conflict.merchant}.`}
      />
      <input name="redirectTo" type="hidden" value="/dev/category-conflicts" />
      <label className="text-xs font-semibold uppercase text-slate-500">
        Replace survivor with
      </label>
      <select
        className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
        defaultValue={conflict.suggestedCanonicalCategory.code}
        name="categoryCode"
      >
        {categories.map((category) => (
          <option key={category.code} value={category.code}>
            {category.label}
          </option>
        ))}
      </select>
      <button
        className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900"
        type="submit"
      >
        Replace survivor category
      </button>
    </form>
  )
}

function ConflictCard({
  conflict,
}: {
  conflict: ResolvedDuplicateCategoryConflict
}) {
  return (
    <section className="rounded border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">
              {conflict.merchant || 'Unknown merchant'}
            </h2>
            <span
              className={`rounded border px-2 py-1 text-xs ${confidenceClass(
                conflict.confidence
              )}`}
            >
              {conflict.confidence} confidence
            </span>
            {conflict.duplicateRowsDisagree && (
              <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                duplicate rows disagree
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600">
            {conflict.date || 'No date'} · {money(conflict.amount)} ·{' '}
            {conflict.accountIdentity}
          </p>
          <p className="max-w-3xl text-sm text-slate-700">
            {conflict.reason}
          </p>
          <p className="break-all font-mono text-xs text-slate-500">
            survivor {conflict.survivorQuickEntryId}
          </p>
        </div>
        <div className="rounded border bg-slate-50 px-3 py-2 text-sm">
          Suggested canonical:{' '}
          <span className="font-semibold">
            {conflict.suggestedCanonicalCategory.label}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Survivor
          </p>
          <p className="mt-2 text-lg font-semibold">
            {conflict.survivorCategory}
          </p>
          <p className="text-sm text-slate-600">
            {conflict.survivorCategoryKind}
          </p>
        </div>
        <div className="rounded border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Duplicate-resolved categories
          </p>
          <div className="mt-2 space-y-2">
            {conflict.duplicateCategories.map((duplicate) => (
              <div key={duplicate.quickEntryId}>
                <p className="font-semibold">
                  {duplicate.canonicalCategoryLabel}
                </p>
                <p className="break-all font-mono text-xs text-slate-500">
                  {duplicate.quickEntryId}
                </p>
                <p className="text-xs text-slate-500">
                  {duplicate.categoryKind} · created{' '}
                  {duplicate.createdAt || 'unknown'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <ReviewForm
            action="keep_survivor"
            className="border-slate-200 bg-white"
            conflict={conflict}
            label="Keep survivor category"
            reason="Kept survivor category from resolved duplicate category conflict review."
          />
          <ReviewForm
            action="review_later"
            className="border-slate-200 bg-white"
            conflict={conflict}
            label="Review later"
            reason="Deferred resolved duplicate category conflict for later review."
          />
          <button
            className="cursor-not-allowed rounded border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
            disabled
            title="Merchant rule creation stays manual in v1."
            type="button"
          >
            Apply merchant rule for future movements
          </button>
        </div>
        <ReplaceCategoryForm conflict={conflict} />
      </div>
    </section>
  )
}

export default async function CategoryConflictsPage({
  searchParams,
}: PageProps) {
  const { supabase, user } = await requireUser()
  const params = await searchParams
  const ledgerSummary = await getLedgerSummary(supabase, user.id)
  const conflicts = getResolvedDuplicateCategoryConflicts(ledgerSummary)
  const duplicateRows = conflicts.reduce(
    (sum, conflict) => sum + conflict.duplicateCategories.length,
    0
  )
  const manualReviewCount = conflicts.filter(
    (conflict) => conflict.confidence === 'low' || conflict.duplicateRowsDisagree
  ).length

  return (
    <main className="space-y-6 bg-slate-50 p-4 text-slate-950 md:p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Category conflict review</h1>
        <p className="max-w-4xl text-sm text-slate-600">
          Review resolved duplicate groups where the survivor and historical
          duplicate rows have different valid categories. Nothing changes until
          you choose an action.
        </p>
      </div>

      <Nav />

      {params?.reviewed && (
        <section className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          Category conflict action recorded on the survivor quick entry.
        </section>
      )}
      {params?.error && (
        <section className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          The category conflict action was not recorded. Refresh and review the
          group again.
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded border bg-white p-4">
          <p className="text-sm text-slate-600">Conflict groups</p>
          <p className="text-3xl font-bold">{conflicts.length}</p>
        </div>
        <div className="rounded border bg-white p-4">
          <p className="text-sm text-slate-600">Duplicate rows</p>
          <p className="text-3xl font-bold">{duplicateRows}</p>
        </div>
        <div className="rounded border bg-white p-4">
          <p className="text-sm text-slate-600">Manual review</p>
          <p className="text-3xl font-bold">{manualReviewCount}</p>
        </div>
        <div className="rounded border bg-white p-4">
          <p className="text-sm text-slate-600">Spending impact</p>
          <p className="text-3xl font-bold">$0.00</p>
        </div>
      </section>

      <section className="rounded border bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold">Merchant rules stay manual</h2>
            <p className="text-sm text-slate-600">
              This page can update a survivor quick_entry by exact ID. Merchant
              learning is not changed automatically in v1.
            </p>
          </div>
          <Link className="rounded border px-3 py-2 text-sm" href="/merchant-rules">
            Open merchant rules
          </Link>
        </div>
      </section>

      {conflicts.length === 0 ? (
        <section className="rounded border bg-white p-8 text-center">
          <h2 className="text-xl font-bold">No category conflicts</h2>
          <p className="mt-2 text-sm text-slate-600">
            Active duplicate-resolution groups do not currently have conflicting
            valid categories.
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {conflicts.map((conflict) => (
            <ConflictCard conflict={conflict} key={conflict.id} />
          ))}
        </div>
      )}
    </main>
  )
}
