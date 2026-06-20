import { requireUser } from '@/lib/auth/requireUser'
import Nav from '../components/Nav'

export const dynamic = 'force-dynamic'

function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString()}`
}

function formatDatePR(dateString: string) {
  const date = new Date(dateString)
  date.setHours(date.getHours() - 4)

  return date.toLocaleString('es-PR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export default async function HistoryPage() {
  const { supabase } = await requireUser()

  const { data: rawEntries, error } = await supabase
    .from('quick_entries')
    .select('*')
    .order('created_at', { ascending: false })

  const entries =
    rawEntries?.map((entry) => ({
      id: entry.id,
      description: entry.description,
      type: entry.entry_type,
      category: entry.category || 'Sin categoría',
      account: entry.account_name || 'N/A',
      amount: Number(entry.amount || 0),
      owner: entry.owner || 'N/A',
      date: entry.created_at,
      displayDate: formatDatePR(entry.created_at),
      source: entry.source || 'Registrado',
    })) || []

  const totalExpenses = entries
    .filter((entry) => entry.type !== 'income')
    .filter((entry) => entry.amount > 0)
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)

  const totalIncome = entries
    .filter((entry) => entry.type === 'income' || entry.amount < 0)
    .reduce((sum, entry) => sum + Math.abs(Number(entry.amount || 0)), 0)

  const categoryTotals = entries
    .filter((entry) => entry.type !== 'income')
    .filter((entry) => entry.amount > 0)
    .reduce((acc: Record<string, number>, entry) => {
      const category = entry.category || 'Sin categoría'
      acc[category] = (acc[category] || 0) + Number(entry.amount || 0)
      return acc
    }, {})

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

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">💸 Gastos registrados</h2>
          <p className="text-3xl font-bold">{formatMoney(totalExpenses)}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">💰 Ingresos registrados</h2>
          <p className="text-3xl font-bold">{formatMoney(totalIncome)}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">📌 Movimientos</h2>
          <p className="text-3xl font-bold">{entries.length}</p>
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-4">📊 Gastos por categoría</h2>

        <div className="space-y-2">
          {categoryRows.map(([category, total]) => (
            <div key={category} className="flex justify-between border rounded p-3">
              <span>{category}</span>
              <strong>{formatMoney(total)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {entries.slice(0, 100).map((entry) => (
          <div key={entry.id} className="border rounded p-4">
            <h2 className="font-bold text-lg">{entry.description}</h2>
            <p>Origen: {entry.source}</p>
            <p>Tipo: {entry.type}</p>
            <p>Categoría: {entry.category || 'Sin categoría'}</p>
            <p>Cuenta: {entry.account}</p>
            <p>Monto: {formatMoney(Math.abs(Number(entry.amount || 0)))}</p>
            <p>Dueño: {entry.owner}</p>
            <p>Fecha: {entry.displayDate}</p>
          </div>
        ))}
      </section>
    </main>
  )
}