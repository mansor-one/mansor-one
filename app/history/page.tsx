import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

function formatDatePR(dateString: string) {
  const date = new Date(dateString)
  date.setHours(date.getHours() - 4)

  return date.toLocaleString('es-PR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export default async function HistoryPage() {
  const { data: entries, error } = await supabase
    .from('quick_entries')
    .select('*')
    .order('created_at', { ascending: false })

  const totalExpenses =
    entries
      ?.filter((entry) => entry.entry_type !== 'income')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0) || 0

  const totalIncome =
    entries
      ?.filter((entry) => entry.entry_type === 'income')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0) || 0

  const categoryTotals =
    entries
      ?.filter((entry) => entry.entry_type !== 'income')
      .reduce((acc: Record<string, number>, entry) => {
        const category = entry.category || 'Sin categoría'
        acc[category] = (acc[category] || 0) + Number(entry.amount || 0)
        return acc
      }, {}) || {}

  const categoryRows = Object.entries(categoryTotals).sort(
    (a, b) => b[1] - a[1]
  )

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">📜 Historial</h1>

      <Nav />

      {error && (
        <pre className="border rounded p-4">
          {JSON.stringify(error, null, 2)}
        </pre>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">💸 Gastos registrados</h2>
          <p className="text-3xl font-bold">
            ${totalExpenses.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">💰 Ingresos registrados</h2>
          <p className="text-3xl font-bold">
            ${totalIncome.toLocaleString()}
          </p>
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-4">📊 Gastos por categoría</h2>

        <div className="space-y-2">
          {categoryRows.map(([category, total]) => (
            <div
              key={category}
              className="flex justify-between border rounded p-3"
            >
              <span>{category}</span>
              <strong>${total.toLocaleString()}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {entries?.map((entry) => (
          <div key={entry.id} className="border rounded p-4">
            <h2 className="font-bold text-lg">{entry.description}</h2>

            <p>Tipo: {entry.entry_type}</p>

            <p>Categoría: {entry.category || 'Sin categoría'}</p>

            <p>Cuenta: {entry.account_name || 'N/A'}</p>

            <p>Monto: ${Number(entry.amount || 0).toLocaleString()}</p>

            <p>Dueño: {entry.owner}</p>

            <p>Fecha: {formatDatePR(entry.created_at)}</p>
          </div>
        ))}
      </section>
    </main>
  )
}