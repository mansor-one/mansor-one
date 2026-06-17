import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default async function SpendingPage() {
  const { data: entries, error } = await supabase
    .from('quick_entries')
    .select('*')
    .eq('source', 'plaid')

  const totals: Record<string, { total: number; count: number }> = {}

  entries?.forEach((entry) => {
    const category = entry.category || 'Sin categoría'

    if (!totals[category]) {
      totals[category] = { total: 0, count: 0 }
    }

    totals[category].total += Number(entry.amount || 0)
    totals[category].count += 1
  })

  const rows = Object.entries(totals).sort(
    (a, b) => b[1].total - a[1].total
  )

  const grandTotal = rows.reduce(
    (sum, [, value]) => sum + value.total,
    0
  )

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">📊 Spending</h1>

      <Nav />

      {error && (
        <div className="border rounded p-4">
          {error.message}
        </div>
      )}

      <section className="border rounded p-4">
        <h2 className="font-semibold">Total desde Plaid</h2>
        <p className="text-4xl font-bold">
          ${grandTotal.toLocaleString()}
        </p>
      </section>

      <section className="space-y-3">
        {rows.map(([category, value]) => (
          <div key={category} className="border rounded p-4">
            <h2 className="text-xl font-bold">{category}</h2>
            <p>Total: ${value.total.toLocaleString()}</p>
            <p>Transacciones: {value.count}</p>
          </div>
        ))}
      </section>
    </main>
  )
}