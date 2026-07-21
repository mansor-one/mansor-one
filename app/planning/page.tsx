import { requireUser } from '@/lib/auth/requireUser'
import {
  getPlanningFundMovements,
  getPlanningFunds,
  planningPriorityOptions,
  type PlanningFund,
  type PlanningFundMovement,
} from '@/lib/financial-engine/planning-management'
import type { Metadata } from 'next'
import AppShell from '../components/AppShell'
import {
  archivePlanningFundAction,
  createPlanningFundAction,
  movePlanningFundsAction,
  updatePlanningFundAction,
} from './actions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Planning | Mansor One',
}

type PlanningPageProps = {
  searchParams?: Promise<{
    error?: string
    saved?: string
  }>
}

const priorityLabels: Record<string, string> = {
  critical: 'Critical',
  regular: 'Regular',
  non_critical: 'Non-critical',
}

const savedMessages: Record<string, string> = {
  archived: 'Fund archived.',
  created: 'Fund created.',
  funded: 'Funds added.',
  spent: 'Funds used.',
  updated: 'Fund updated.',
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

function isActiveFund(item: PlanningFund) {
  return (
    !item.is_archived &&
    !item.is_completed &&
    item.status !== 'archived' &&
    item.status !== 'completed'
  )
}

function fieldClass() {
  return 'w-full rounded border px-3 py-2 text-sm'
}

export default async function PlanningPage({ searchParams }: PlanningPageProps) {
  const params = (await searchParams) || {}
  const { supabase, user } = await requireUser()
  const [items, movements] = await Promise.all([
    getPlanningFunds(supabase, user.id),
    getPlanningFundMovements(supabase, user.id),
  ])
  const movementsByFund = movements.reduce<
    Record<string, PlanningFundMovement[]>
  >((groups, movement) => {
    if (!movement.planning_item_id) return groups

    groups[movement.planning_item_id] ||= []
    groups[movement.planning_item_id].push(movement)
    return groups
  }, {})

  const active = items.filter(isActiveFund)
  const archived = items.filter((item) => !isActiveFund(item))
  const critical = active.filter((item) => item.priority_level === 'critical')
  const regular = active.filter((item) => item.priority_level === 'regular')
  const nonCritical = active.filter(
    (item) => item.priority_level === 'non_critical'
  )

  const totalTarget = active.reduce(
    (sum, item) => sum + Number(item.target_amount || 0),
    0
  )
  const totalAllocated = active.reduce(
    (sum, item) => sum + Number(item.current_amount || 0),
    0
  )
  const remaining = Math.max(0, totalTarget - totalAllocated)

  return (
    <AppShell
      header={{
        eyebrow: 'Fondos familiares',
        title: 'Metas',
        subtitle:
          'Dinero reservado para metas y prioridades, separado de pagos y obligaciones.',
      }}
    >
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

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryTile label="Target amount" value={money(totalTarget)} />
        <SummaryTile label="Allocated" value={money(totalAllocated)} />
        <SummaryTile label="Remaining" value={money(remaining)} />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Create Fund</h2>
        <form
          action={createPlanningFundAction}
          className="grid grid-cols-1 gap-4 rounded border p-4 md:grid-cols-4"
        >
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium">Name</span>
            <input className={fieldClass()} name="name" required />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Category</span>
            <input
              className={fieldClass()}
              name="category"
              placeholder="Emergency fund"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Priority</span>
            <PrioritySelect />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Target amount</span>
            <input
              className={fieldClass()}
              min="0"
              name="targetAmount"
              step="0.01"
              type="number"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Current allocated</span>
            <input
              className={fieldClass()}
              min="0"
              name="currentAmount"
              step="0.01"
              type="number"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Due date</span>
            <input className={fieldClass()} name="dueDate" type="date" />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Owner</span>
            <input
              className={fieldClass()}
              name="owner"
              placeholder="Household"
            />
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
              Create fund
            </button>
          </div>
        </form>
      </section>

      <PlanningSection
        id="funds"
        items={critical}
        movementsByFund={movementsByFund}
        title="Critical"
      />
      <PlanningSection
        items={regular}
        movementsByFund={movementsByFund}
        title="Regular"
      />
      <PlanningSection
        items={nonCritical}
        movementsByFund={movementsByFund}
        title="Non-critical"
      />

      <PlanningSection
        archiveOnly
        title="Archived / Completed Funds"
        items={archived}
        movementsByFund={movementsByFund}
      />
    </AppShell>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-4">
      <h2 className="text-sm font-semibold opacity-70">{label}</h2>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  )
}

function PrioritySelect({
  defaultValue = 'regular',
}: {
  defaultValue?: string | null
}) {
  return (
    <select
      className={fieldClass()}
      defaultValue={defaultValue || 'regular'}
      name="priorityLevel"
    >
      {planningPriorityOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function PlanningSection({
  archiveOnly = false,
  id,
  title,
  items,
  movementsByFund,
}: {
  archiveOnly?: boolean
  id?: string
  title: string
  items: PlanningFund[]
  movementsByFund: Record<string, PlanningFundMovement[]>
}) {
  return (
    <section className="space-y-4" id={id}>
      <h2 className="text-2xl font-bold">{title}</h2>

      {items.length === 0 && (
        <div className="rounded border p-4 text-sm opacity-70">No funds.</div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {items.map((item) => (
          <FundCard
            archiveOnly={archiveOnly}
            item={item}
            key={item.id}
            movements={movementsByFund[item.id] || []}
          />
        ))}
      </div>
    </section>
  )
}

function FundCard({
  archiveOnly,
  item,
  movements,
}: {
  archiveOnly: boolean
  item: PlanningFund
  movements: PlanningFundMovement[]
}) {
  const targetAmount = Number(item.target_amount || 0)
  const currentAmount = Number(item.current_amount || 0)
  const spentAmount = Number(item.spent_amount || 0)
  const percent =
    targetAmount > 0 ? Math.round((currentAmount / targetAmount) * 100) : 0
  const remaining = Math.max(0, targetAmount - currentAmount)

  return (
    <article className="space-y-4 rounded border p-4" id={`fund-${item.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">{item.name}</h3>
          <p className="text-sm opacity-70">
            {item.category || 'General'} ·{' '}
            {priorityLabels[item.priority_level] || item.priority_level}
          </p>
        </div>
        <span className="rounded border px-3 py-1 text-xs">
          {item.status || (archiveOnly ? 'archived' : 'open')}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-4">
        <Metric label="Target" value={money(targetAmount)} />
        <Metric label="Allocated" value={money(currentAmount)} />
        <Metric label="Spent" value={money(spentAmount)} />
        <Metric label="Remaining" value={money(remaining)} />
      </div>

      <div className="space-y-1">
        <div className="h-3 w-full overflow-hidden rounded border">
          <div
            className="h-3 bg-green-500"
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
        <p className="text-xs opacity-70">{percent}% funded</p>
      </div>

      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <p>Due: {item.due_date || 'N/A'}</p>
        <p>Owner: {item.owner || 'Household'}</p>
      </div>

      {item.notes && (
        <pre className="whitespace-pre-wrap rounded bg-black/5 p-3 text-xs">
          {item.notes}
        </pre>
      )}

      <MovementHistory movements={movements} />

      {!archiveOnly && (
        <>
          <form
            action={updatePlanningFundAction}
            className="grid grid-cols-1 gap-3 border-t pt-4 md:grid-cols-4"
          >
            <input name="id" type="hidden" value={item.id} />

            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium">Name</span>
              <input
                className={fieldClass()}
                defaultValue={item.name}
                name="name"
                required
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Category</span>
              <input
                className={fieldClass()}
                defaultValue={item.category || ''}
                name="category"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Priority</span>
              <PrioritySelect defaultValue={item.priority_level} />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Target amount</span>
              <input
                className={fieldClass()}
                defaultValue={numberValue(item.target_amount)}
                min="0"
                name="targetAmount"
                step="0.01"
                type="number"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Due date</span>
              <input
                className={fieldClass()}
                defaultValue={item.due_date || ''}
                name="dueDate"
                type="date"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Owner</span>
              <input
                className={fieldClass()}
                defaultValue={item.owner || ''}
                name="owner"
              />
            </label>

            <label className="space-y-1 md:col-span-3">
              <span className="text-sm font-medium">Notes</span>
              <textarea
                className={fieldClass()}
                defaultValue={item.notes || ''}
                name="notes"
                rows={3}
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

          <div className="grid grid-cols-1 gap-3 border-t pt-4 md:grid-cols-2">
            <MovementForm direction="add" id={item.id} />
            <MovementForm direction="spend" id={item.id} />
          </div>

          <form
            action={archivePlanningFundAction}
            className="grid grid-cols-1 gap-3 border-t pt-4 md:grid-cols-[1fr_auto]"
          >
            <input name="id" type="hidden" value={item.id} />
            <input
              className={fieldClass()}
              name="archiveReason"
              placeholder="Archive reason"
            />
            <button
              className="rounded border px-4 py-2 text-sm font-semibold"
              type="submit"
            >
              Archive fund
            </button>
          </form>
        </>
      )}
    </article>
  )
}

function movementLabel(type: string) {
  if (type === 'assign') return 'Added'
  if (type === 'remove') return 'Used'
  if (type === 'transfer_in') return 'Transfer in'
  if (type === 'transfer_out') return 'Transfer out'
  return 'Adjusted'
}

function MovementHistory({
  movements,
}: {
  movements: PlanningFundMovement[]
}) {
  return (
    <section className="space-y-2 border-t pt-4">
      <h4 className="text-sm font-semibold">Movement history</h4>

      {movements.length === 0 ? (
        <p className="text-sm opacity-70">No movements yet.</p>
      ) : (
        <div className="space-y-2">
          {movements.slice(0, 8).map((movement) => (
            <div
              className="grid grid-cols-1 gap-1 rounded border p-3 text-sm sm:grid-cols-[110px_1fr_auto]"
              key={movement.id}
            >
              <span className="opacity-70">
                {movement.created_at
                  ? movement.created_at.slice(0, 10)
                  : 'N/A'}
              </span>
              <span>
                {movementLabel(movement.transaction_type)}
                {movement.notes ? ` - ${movement.notes}` : ''}
              </span>
              <strong>{money(movement.amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold opacity-60">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  )
}

function MovementForm({
  direction,
  id,
}: {
  direction: 'add' | 'spend'
  id: string
}) {
  const isAdd = direction === 'add'

  return (
    <form action={movePlanningFundsAction} className="grid grid-cols-1 gap-2">
      <input name="id" type="hidden" value={id} />
      <input name="direction" type="hidden" value={direction} />
      <label className="space-y-1">
        <span className="text-sm font-medium">
          {isAdd ? 'Add funds' : 'Spend/use funds'}
        </span>
        <input
          className={fieldClass()}
          min="0.01"
          name="amount"
          required
          step="0.01"
          type="number"
        />
      </label>
      <input className={fieldClass()} name="notes" placeholder="Note" />
      <button
        className="rounded border px-4 py-2 text-sm font-semibold"
        type="submit"
      >
        {isAdd ? 'Add funds' : 'Use funds'}
      </button>
    </form>
  )
}
