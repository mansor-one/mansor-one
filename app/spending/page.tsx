import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default async function SpendingPage() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  const startOfMonth = new Date(year, month, 1)
    .toISOString()
    .slice(0, 10)

  const today = now.toISOString().slice(0, 10)

  const day = now.getDate()
  const startOfQuincena =
    day <= 15
      ? new Date(year, month, 1).toISOString().slice(0, 10)
      : new Date(year, month, 16).toISOString().slice(0, 10)

  const { data: entries, error } = await supabase
    .from('quick_entries')
    .select('*')
    .eq('source', 'plaid')
    .gte('entry_date', startOfMonth)
    .lte('entry_date', today)

  const monthlyTotals: Record<string, { total: number; count: number }> = {}
  const quincenaTotals: Record<string, { total: number; count: number }> = {}

  entries?.forEach((entry) => {
    const category = entry.category || 'Sin categoría'
    const amount = Number(entry.amount || 0)

    if (!monthlyTotals[category]) {
      monthlyTotals[category] = { total: 0, count: 0 }
    }

    monthlyTotals[category].total += amount
    monthlyTotals[category].count += 1

    if (entry.entry_date >= startOfQuincena) {
      if (!quincenaTotals[category]) {
        quincenaTotals[category] = { total: 0, count: 0 }
      }

      quincenaTotals[category].total += amount
      quincenaTotals[category].count += 1
    }
  })

  const monthlyRows = Object.entries(monthlyTotals).sort(
    (a, b) => b[1].total - a[1].total
  )

  const quincenaRows = Object.entries(quincenaTotals).sort(
    (a, b) => b[1].total - a[1].total
  )

  const monthlyTotal = monthlyRows.reduce(
    (sum, [, value]) => sum + value.total,
    0
  )

  const quincenaTotal = quincenaRows.reduce(
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

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Gastos del mes</h2>
          <p className="text-sm opacity-70">
            Desde {startOfMonth} hasta {today}
          </p>
          <p className="text-4xl font-bold">
            ${monthlyTotal.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Gastos de la quincena</h2>
          <p className="text-sm opacity-70">
            Desde {startOfQuincena} hasta {today}
          </p>
          <p className="text-4xl font-bold">
            ${quincenaTotal.toLocaleString()}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Este mes por categoría</h2>

        {monthlyRows.map(([category, value]) => (
          <div key={category} className="border rounded p-4">
            <h3 className="text-xl font-bold">{category}</h3>
            <p>Total: ${value.total.toLocaleString()}</p>
            <p>Transacciones: {value.count}</p>
            <div className="mt-3 space-y-1">
  {entries
    ?.filter((entry) => (entry.category || 'Sin categoría') === category)
    .slice(0, 10)
    .map((entry) => (
      <div key={entry.id} className="text-sm border-t pt-1">
        <span>{entry.entry_date}</span>{' '}
        <span>{entry.description}</span>{' '}
        <strong>${Number(entry.amount || 0).toLocaleString()}</strong>
      </div>
    ))}
</div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Esta quincena por categoría</h2>

        {quincenaRows.map(([category, value]) => (
          <div key={category} className="border rounded p-4">
            <h3 className="text-xl font-bold">{category}</h3>
            <p>Total: ${value.total.toLocaleString()}</p>
            <p>Transacciones: {value.count}</p>
          </div>
        ))}
      </section>
    </main>
  )
}