import { requireUser } from '@/lib/auth/requireUser'
import Nav from '../components/Nav'

export const dynamic = 'force-dynamic'

type AthMovilEmail = {
  id: string
  subject: string | null
  counterparty: string | null
  amount: number | string | null
  direction: string | null
  suggested_category: string | null
  email_date: string | null
  message: string | null
  is_internal_transfer: boolean | null
  exclude_from_spending: boolean | null
}

export default async function AthMovilPage() {
  const { supabase } = await requireUser()

  const { data: emails, error } = await supabase
    .from('ath_movil_emails')
    .select('*')
    .eq('is_ignored', false)
    .order('email_date', { ascending: false })
    .limit(100)

  const items = ((emails || []) as AthMovilEmail[])

  const spendingItems = items.filter(
  (item) =>
    !item.is_internal_transfer &&
    !item.exclude_from_spending &&
    item.direction !== 'received' &&
    Number(item.amount || 0) > 0
)

  const totalSpending = spendingItems.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  )

  const reviewCount = items.filter(
    (item) => (item.suggested_category || 'Revisar') === 'Revisar'
  ).length

  const internalTotal = items
    .filter((item) => item.is_internal_transfer)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const categoryTotals = spendingItems.reduce<Record<string, number>>((acc, item) => {
    const category = item.suggested_category || 'Revisar'
    acc[category] = (acc[category] || 0) + Number(item.amount || 0)
    return acc
  }, {})

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">📱 ATH Móvil</h1>
      <Nav />

      {error && <pre className="text-red-500">{error.message}</pre>}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Total ATH gastos</h2>
          <p className="text-3xl font-bold">${totalSpending.toLocaleString()}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Pendientes revisar</h2>
          <p className="text-3xl font-bold">{reviewCount}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Transferencias internas</h2>
          <p className="text-3xl font-bold">${internalTotal.toLocaleString()}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Correos visibles</h2>
          <p className="text-3xl font-bold">{items.length}</p>
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-4">Resumen por categoría</h2>

        <div className="space-y-2">
          {Object.entries(categoryTotals).map(([category, amount]) => (
            <p key={category}>
              {category}: ${Number(amount).toLocaleString()}
            </p>
          ))}
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-4">Correos ATH importados</h2>

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="border rounded p-4">
              <strong>{item.counterparty || item.subject}</strong>
              <p>Monto: ${Number(item.amount || 0).toLocaleString()}</p>
              <p>Categoría: {item.suggested_category || 'Revisar'}</p>
              <p>Fecha: {item.email_date || 'N/A'}</p>
              {item.message && <p>Mensaje: {item.message}</p>}
              {item.is_internal_transfer && (
                <p className="font-semibold">🔄 Transferencia interna</p>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
