import { requireUser } from '@/lib/auth/requireUser'
import Nav from '../components/Nav'

export default async function PaymentsPage() {
  const { supabase, user } = await requireUser()
  const { data: payments, error } = await supabase
    .from('scheduled_payments')
    .select('*')
    .eq('is_active', true)
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order('due_day', { ascending: true })

  const totalMonthly =
    payments?.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    ) || 0

  return (
    <main className="p-8 space-y-6">

      <h1 className="text-3xl font-bold">
        📅 Pagos Programados
      </h1>
<Nav />
      {error && (
        <div className="border border-red-500 rounded p-4">
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
      )}

      <div className="border rounded p-4 bg-gray-50">
        <h2 className="text-xl font-semibold">
          Total mensual estimado
        </h2>

        <p className="text-3xl font-bold">
          ${totalMonthly.toLocaleString()}
        </p>
      </div>

      <div className="space-y-4">

        {payments?.map((payment) => (
          <div
            key={payment.id}
            className="border rounded p-4"
          >

            <h2 className="text-xl font-semibold">
              {payment.name}
            </h2>

            <p>
              💰 Monto:
              {' '}
              ${Number(payment.amount || 0).toLocaleString()}
            </p>

            <p>
              📅 Día:
              {' '}
              {payment.due_day || 'Variable'}
            </p>

            <p>
              👤 Responsable:
              {' '}
              {payment.owner || 'N/A'}
            </p>

            <p>
              🏷️ Categoría:
              {' '}
              {payment.category || 'N/A'}
            </p>

            {payment.notes && (
              <p className="mt-2 text-sm text-gray-600">
                📝 {payment.notes}
              </p>
            )}

          </div>
        ))}

      </div>

    </main>
  )
}
