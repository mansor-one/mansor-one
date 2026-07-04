import { requireUser } from '@/lib/auth/requireUser'
import {
  buildIncomePlanningSummary,
  getIncomeDestinationOptions,
  getIncomeRows,
  incomeCadenceOptions,
  incomeCategoryOptions,
  incomeConfidenceOptions,
  incomeOwnerScopeOptions,
  incomeStatusOptions,
  incomeTypeOptions,
  type IncomeDestinationOption,
} from '@/lib/financial-engine'
import type { IncomeSchedule } from '@/lib/financial-engine'
import type { Metadata } from 'next'
import Nav from '../components/Nav'
import { createIncomeAction, updateIncomeAction } from './actions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Income Planning | Mansor One',
}

type IncomePageProps = {
  searchParams?: Promise<{
    error?: string
    saved?: string
  }>
}

const savedMessages: Record<string, string> = {
  created: 'Income created.',
  updated: 'Income updated.',
}

function money(value: number | null | undefined) {
  return `$${Number(value || 0).toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`
}

function numberValue(value: number | null | undefined) {
  return Number(value || 0).toFixed(2)
}

function fieldClass() {
  return 'w-full rounded border px-3 py-2 text-sm'
}

function textValue(value: string | null | undefined) {
  return value || ''
}

function destinationValue(income: IncomeSchedule) {
  if (!income.destination_account_id || !income.destination_account_source) {
    return ''
  }

  return `${income.destination_account_source}:${income.destination_account_id}`
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return 'No date'
  const [year, month, day] = dateString.split('-')
  return `${month}/${day}/${year}`
}

function statusLabel(status: string | null | undefined) {
  return (
    incomeStatusOptions.find((option) => option.value === status)?.label ||
    'Expected'
  )
}

function categoryLabel(categoryCode: string | null | undefined) {
  return (
    incomeCategoryOptions.find((option) => option.value === categoryCode)
      ?.label || 'Deposit'
  )
}

function DestinationSelect({
  defaultValue = '',
  destinations,
}: {
  defaultValue?: string
  destinations: IncomeDestinationOption[]
}) {
  return (
    <select className={fieldClass()} defaultValue={defaultValue} name="destination">
      <option value="">No destination selected</option>
      {destinations.map((destination) => (
        <option
          key={`${destination.source}:${destination.id}`}
          value={`${destination.source}:${destination.id}`}
        >
          {destination.label}
          {destination.detail ? ` - ${destination.detail}` : ''}
        </option>
      ))}
    </select>
  )
}

function IncomeTypeSelect({ defaultValue = 'one_time' }: { defaultValue?: string | null }) {
  return (
    <select className={fieldClass()} defaultValue={defaultValue || 'one_time'} name="incomeType">
      {incomeTypeOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function CategorySelect({ defaultValue = 'income_deposit' }: { defaultValue?: string | null }) {
  return (
    <select className={fieldClass()} defaultValue={defaultValue || 'income_deposit'} name="categoryCode">
      {incomeCategoryOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function ConfidenceSelect({ defaultValue = 'confirmed' }: { defaultValue?: string | null }) {
  return (
    <select className={fieldClass()} defaultValue={defaultValue || 'confirmed'} name="confidence">
      {incomeConfidenceOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function CadenceSelect({ defaultValue = 'one_time' }: { defaultValue?: string | null }) {
  return (
    <select className={fieldClass()} defaultValue={defaultValue || 'one_time'} name="cadence">
      {incomeCadenceOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function OwnerScopeSelect({ defaultValue = 'household' }: { defaultValue?: string | null }) {
  return (
    <select className={fieldClass()} defaultValue={defaultValue || 'household'} name="ownerScope">
      {incomeOwnerScopeOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function StatusSelect({ defaultValue = 'expected' }: { defaultValue?: string | null }) {
  return (
    <select className={fieldClass()} defaultValue={defaultValue || 'expected'} name="status">
      {incomeStatusOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function CreateIncomeForm({
  destinations,
}: {
  destinations: IncomeDestinationOption[]
}) {
  return (
    <form
      action={createIncomeAction}
      className="grid grid-cols-1 gap-4 rounded border p-4 md:grid-cols-4"
    >
      <label className="space-y-1 md:col-span-2">
        <span className="text-sm font-medium">Name</span>
        <input className={fieldClass()} name="name" required />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Type</span>
        <IncomeTypeSelect />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Category</span>
        <CategorySelect />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Amount</span>
        <input
          className={fieldClass()}
          min="0"
          name="amount"
          required
          step="0.01"
          type="number"
        />
      </label>

      <label className="flex items-center gap-2 pt-7 text-sm">
        <input name="amountIsEstimated" type="checkbox" />
        Estimated
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Confidence</span>
        <ConfidenceSelect />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Expected date</span>
        <input
          className={fieldClass()}
          name="expectedDate"
          required
          type="date"
        />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Cadence</span>
        <CadenceSelect />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Owner</span>
        <OwnerScopeSelect />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Status</span>
        <StatusSelect />
      </label>

      <label className="space-y-1 md:col-span-2">
        <span className="text-sm font-medium">Destination account</span>
        <DestinationSelect destinations={destinations} />
      </label>

      <label className="space-y-1 md:col-span-3">
        <span className="text-sm font-medium">Notes</span>
        <textarea className={fieldClass()} name="notes" rows={2} />
      </label>

      <div className="flex items-end">
        <button
          className="w-full rounded bg-black px-4 py-2 text-sm font-semibold text-white"
          type="submit"
        >
          Create income
        </button>
      </div>
    </form>
  )
}

function IncomeEditForm({
  destinations,
  income,
}: {
  destinations: IncomeDestinationOption[]
  income: IncomeSchedule
}) {
  return (
    <form action={updateIncomeAction} className="grid grid-cols-1 gap-3 md:grid-cols-6">
      <input name="incomeId" type="hidden" value={income.id || ''} />

      <label className="space-y-1 md:col-span-2">
        <span className="text-xs font-medium uppercase tracking-wide opacity-60">Name</span>
        <input
          className={fieldClass()}
          defaultValue={textValue(income.name)}
          name="name"
          required
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide opacity-60">Amount</span>
        <input
          className={fieldClass()}
          defaultValue={numberValue(income.amount)}
          min="0"
          name="amount"
          required
          step="0.01"
          type="number"
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide opacity-60">Expected</span>
        <input
          className={fieldClass()}
          defaultValue={textValue(income.next_expected_date)}
          name="expectedDate"
          required
          type="date"
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide opacity-60">Status</span>
        <StatusSelect defaultValue={income.status} />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide opacity-60">Owner</span>
        <OwnerScopeSelect defaultValue={income.owner_scope} />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide opacity-60">Type</span>
        <IncomeTypeSelect defaultValue={income.income_type} />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide opacity-60">Category</span>
        <CategorySelect defaultValue={income.category_code} />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide opacity-60">Cadence</span>
        <CadenceSelect defaultValue={income.cadence} />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide opacity-60">Confidence</span>
        <ConfidenceSelect defaultValue={income.confidence} />
      </label>

      <label className="flex items-center gap-2 pt-6 text-sm">
        <input
          defaultChecked={income.amount_is_estimated === true}
          name="amountIsEstimated"
          type="checkbox"
        />
        Estimated
      </label>

      <label className="space-y-1 md:col-span-2">
        <span className="text-xs font-medium uppercase tracking-wide opacity-60">Destination</span>
        <DestinationSelect
          defaultValue={destinationValue(income)}
          destinations={destinations}
        />
      </label>

      <label className="space-y-1 md:col-span-5">
        <span className="text-xs font-medium uppercase tracking-wide opacity-60">Notes</span>
        <textarea
          className={fieldClass()}
          defaultValue={textValue(income.notes)}
          name="notes"
          rows={2}
        />
      </label>

      <div className="flex items-end">
        <button
          className="w-full rounded bg-black px-4 py-2 text-sm font-semibold text-white"
          type="submit"
        >
          Save
        </button>
      </div>
    </form>
  )
}

function IncomeRow({
  destinations,
  income,
}: {
  destinations: IncomeDestinationOption[]
  income: IncomeSchedule
}) {
  return (
    <article className="space-y-4 rounded border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{income.name || 'Income'}</h3>
          <p className="text-sm opacity-70">
            {categoryLabel(income.category_code)} · {statusLabel(income.status)} ·{' '}
            {formatDate(income.next_expected_date)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold">{money(income.amount)}</p>
          {income.amount_is_estimated && (
            <p className="text-xs uppercase tracking-wide opacity-60">Estimated</p>
          )}
        </div>
      </div>

      <IncomeEditForm destinations={destinations} income={income} />
    </article>
  )
}

function IncomeSection({
  destinations,
  emptyText,
  items,
  title,
}: {
  destinations: IncomeDestinationOption[]
  emptyText: string
  items: IncomeSchedule[]
  title: string
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold">{title}</h2>
      {items.length === 0 && (
        <div className="rounded border p-4 text-sm opacity-70">{emptyText}</div>
      )}
      <div className="space-y-4">
        {items.map((income) => (
          <IncomeRow
            destinations={destinations}
            income={income}
            key={income.id}
          />
        ))}
      </div>
    </section>
  )
}

export default async function IncomePage({ searchParams }: IncomePageProps) {
  const params = (await searchParams) || {}
  const { supabase, user } = await requireUser()
  const [incomeRows, destinations] = await Promise.all([
    getIncomeRows(supabase, user.id),
    getIncomeDestinationOptions(supabase, user.id),
  ])
  const summary = buildIncomePlanningSummary(incomeRows)
  const projectedTotal = summary.projectedIncome.reduce(
    (sum, income) => sum + Number(income.amount || 0),
    0
  )

  return (
    <main className="space-y-8 p-8">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold">Income Planning</h1>
        <p className="max-w-3xl opacity-75">
          Expected income is used for projections until it is received,
          missed, or cancelled.
        </p>
      </div>

      <Nav />

      {params.saved && savedMessages[params.saved] && (
        <div className="rounded border border-green-500/40 bg-green-500/10 p-4 text-sm">
          {savedMessages[params.saved]}
        </div>
      )}

      {params.error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-4 text-sm">
          {params.error}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryTile
          label="Projected income"
          value={money(projectedTotal)}
        />
        <SummaryTile
          label="Expected"
          value={String(summary.expectedIncome.length)}
        />
        <SummaryTile
          label="Received"
          value={String(summary.receivedIncome.length)}
        />
        <SummaryTile
          label="Inactive"
          value={String(summary.missedIncome.length + summary.cancelledIncome.length)}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Create Income</h2>
        <CreateIncomeForm destinations={destinations} />
      </section>

      <IncomeSection
        destinations={destinations}
        emptyText="No expected income is currently projected."
        items={summary.expectedIncome}
        title="Expected Income"
      />

      <IncomeSection
        destinations={destinations}
        emptyText="No received income has been marked here yet."
        items={summary.receivedIncome}
        title="Received Income"
      />

      <IncomeSection
        destinations={destinations}
        emptyText="No missed or cancelled income."
        items={[...summary.missedIncome, ...summary.cancelledIncome]}
        title="Missed / Cancelled"
      />
    </main>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-4">
      <p className="text-sm opacity-70">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  )
}
