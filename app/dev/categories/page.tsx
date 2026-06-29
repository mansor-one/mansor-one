import { requireUser } from '@/lib/auth/requireUser'
import {
  type CanonicalCategory,
  getChildren,
  getParent,
  getSystemCategories,
  searchCategories,
} from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams?: Promise<{
    q?: string
  }>
}

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function sortCategories(categories: CanonicalCategory[]) {
  return [...categories].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.displayName.localeCompare(b.displayName)
  })
}

function categoryTree(categories: CanonicalCategory[]) {
  const parents = sortCategories(
    categories.filter((category) => category.parentId === null)
  )

  return parents.map((parent) => ({
    parent,
    children: getChildren(parent.code),
  }))
}

function CategoryDetails({ category }: { category: CanonicalCategory }) {
  const parent = getParent(category.code)
  const children = getChildren(category.code)

  return (
    <div className="border rounded p-3 space-y-2">
      <div>
        <h3 className="font-semibold">{category.displayName}</h3>
        <p className="text-sm opacity-70">
          {category.code} · {category.kind} · sort {category.sortOrder}
        </p>
      </div>

      <p className="text-sm">
        Parent:{' '}
        {parent ? `${parent.displayName} (${parent.code})` : 'None'}
      </p>

      <p className="text-sm">
        Children:{' '}
        {children.length > 0
          ? children.map((child) => child.displayName).join(', ')
          : 'None'}
      </p>
    </div>
  )
}

export default async function DevCategoriesPage({ searchParams }: PageProps) {
  const { supabase } = await createServerSupabase()
  await requireUser(supabase)

  const params = await searchParams
  const query = params?.q?.trim() || ''
  const categories = getSystemCategories()
  const results = query ? searchCategories(query) : categories
  const tree = categoryTree(categories)

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dev Categories</h1>
        <p className="text-sm opacity-70">
          Read-only developer view for Canonical Category Engine v1.
        </p>
      </div>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Search</h2>
        <form className="flex flex-col md:flex-row gap-3">
          <input
            className="border rounded px-3 py-2 flex-1"
            defaultValue={query}
            name="q"
            placeholder="Search by code or display name"
            type="search"
          />
          <button className="border rounded px-4 py-2" type="submit">
            Search
          </button>
        </form>
        <p className="text-sm opacity-70">
          {results.length} of {categories.length} categories
        </p>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Search Results</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {results.map((category) => (
            <CategoryDetails category={category} key={category.id} />
          ))}
        </div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">Tree</h2>
        <div className="space-y-3">
          {tree.map(({ parent, children }) => (
            <div className="border rounded p-3" key={parent.id}>
              <div>
                <h3 className="font-semibold">{parent.displayName}</h3>
                <p className="text-sm opacity-70">
                  {parent.code} · {parent.kind}
                </p>
              </div>

              <div className="mt-3 pl-4 border-l space-y-2">
                {children.map((child) => (
                  <div key={child.id}>
                    <span className="font-medium">{child.displayName}</span>{' '}
                    <span className="text-sm opacity-70">{child.code}</span>{' '}
                    <span className="text-sm opacity-70">{child.kind}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <details className="border rounded p-4">
        <summary className="font-semibold">Raw JSON</summary>
        <pre className="mt-3 overflow-auto text-sm">
          {asJson({
            categories,
            results,
            tree,
          })}
        </pre>
      </details>
    </main>
  )
}
