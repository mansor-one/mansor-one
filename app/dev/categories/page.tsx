import { requireUser } from '@/lib/auth/requireUser'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type CategoryKind =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'payment'
  | 'adjustment'

type TransactionCategoryRow = {
  id: string
  user_id: string | null
  code: string
  label: string
  parent_id: string | null
  kind: CategoryKind
  is_system: boolean
  is_active: boolean
  sort_order: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

const categoryKinds: CategoryKind[] = [
  'expense',
  'income',
  'transfer',
  'payment',
  'adjustment',
]

function countByKind(rows: TransactionCategoryRow[]) {
  return categoryKinds.map((kind) => ({
    kind,
    count: rows.filter((row) => row.kind === kind).length,
  }))
}

function sortCategories(rows: TransactionCategoryRow[]) {
  return [...rows].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order
    }

    return a.label.localeCompare(b.label)
  })
}

function groupedCategories(rows: TransactionCategoryRow[]) {
  const byParent = new Map<string, TransactionCategoryRow[]>()
  const ids = new Set(rows.map((row) => row.id))

  rows.forEach((row) => {
    if (!row.parent_id) return

    const siblings = byParent.get(row.parent_id) || []
    siblings.push(row)
    byParent.set(row.parent_id, siblings)
  })

  const topLevel = sortCategories(
    rows.filter((row) => !row.parent_id || !ids.has(row.parent_id))
  )

  return topLevel.map((parent) => ({
    parent,
    children: sortCategories(byParent.get(parent.id) || []),
  }))
}

function CategoryTree({
  title,
  rows,
}: {
  title: string
  rows: TransactionCategoryRow[]
}) {
  const groups = groupedCategories(rows)

  return (
    <section className="border rounded p-4 space-y-3">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm opacity-70">{rows.length} categories</p>
      </div>

      <div className="space-y-3">
        {groups.map(({ parent, children }) => (
          <div key={parent.id} className="border rounded p-3">
            <div className="flex flex-wrap gap-2 items-baseline">
              <h3 className="font-semibold">{parent.label}</h3>
              <span className="text-sm opacity-70">{parent.code}</span>
              <span className="text-sm opacity-70">{parent.kind}</span>
            </div>

            {children.length > 0 && (
              <div className="mt-3 pl-4 border-l space-y-2">
                {children.map((child) => (
                  <div key={child.id}>
                    <span className="font-medium">{child.label}</span>{' '}
                    <span className="text-sm opacity-70">{child.code}</span>{' '}
                    <span className="text-sm opacity-70">{child.kind}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {groups.length === 0 && (
          <p className="opacity-70">No categories found.</p>
        )}
      </div>
    </section>
  )
}

export default async function DevCategoriesPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)

  const { data, error } = await supabase
    .from('transaction_categories')
    .select(
      'id, user_id, code, label, parent_id, kind, is_system, is_active, sort_order, metadata, created_at, updated_at'
    )
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })

  const categories = (data || []) as TransactionCategoryRow[]
  const systemCategories = categories.filter((category) => category.is_system)
  const userCategories = categories.filter(
    (category) => category.user_id === user.id && !category.is_system
  )
  const kindCounts = countByKind(categories)

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dev Categories</h1>
        <p className="text-sm opacity-70">
          Read-only developer view for Category System v1.
        </p>
      </div>

      {error && (
        <section className="border rounded p-4 text-red-600">
          <h2 className="text-xl font-bold">Error</h2>
          <pre className="mt-3 overflow-auto text-sm">
            {JSON.stringify(error, null, 2)}
          </pre>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {kindCounts.map((item) => (
          <div key={item.kind} className="border rounded p-4">
            <h2 className="font-semibold">{item.kind}</h2>
            <p className="mt-3 text-3xl font-bold">{item.count}</p>
          </div>
        ))}
      </section>

      <CategoryTree title="System categories" rows={systemCategories} />
      <CategoryTree title="User categories" rows={userCategories} />

      <details className="border rounded p-4">
        <summary className="font-semibold">Raw JSON</summary>
        <pre className="mt-3 overflow-auto text-sm">
          {JSON.stringify(
            {
              systemCategories,
              userCategories,
              kindCounts,
            },
            null,
            2
          )}
        </pre>
      </details>
    </main>
  )
}
