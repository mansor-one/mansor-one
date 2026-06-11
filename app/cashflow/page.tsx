import { supabase } from '@/lib/supabase'

export default async function CashflowPage() {
  const { data: payments } = await supabase
    .from('scheduled_payments')
    .select('*')
    .eq('is_active', true)
    .order('due_day', { ascending: true })

  const { data: income } = await supabase
    .from('income_schedule')
    .select('*')

  const paymentsBeforeNextPay =
    payments?.filter((payment) =>
      payment.due_day && payment.due_day <= 18
    ) || []

  const totalDueBeforeNextPay =
    paymentsBeforeNextPay.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    )

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">💰 Cash Flow</h1>

      <section className="border rounded p-4">
        <h2 className="text-xl font-semibold">Próximo ingreso principal</h2>
        <p>Manuel - 18 de junio</p>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-xl font-semibold">Pagos antes del 18</h2>
        <p className="text-3xl font-bold">
          ${totalDueBeforeNextPay.toLocaleString()}
        </p>
      </section>

      <section className="space-y-4">
        {paymentsBeforeNextPay.map((payment) => (
          <div key={payment.id} className="border rounded p-4">
            <h3 className="font-bold">{payment.name}</h3>
            <p>${Number(payment.amount || 0).toLocaleString()}</p>
            <p>Día: {payment.due_day}</p>
            <p>{payment.notes}</p>
          </div>
        ))}
      </section>

      <section className="border rounded p-4">
        <h2 className="text-xl font-semibold">Ingresos conocidos</h2>
        <ul>
          {income?.map((item) => (
            <li key={item.id}>
              {item.name} - {item.owner} - ${Number(item.amount || 0).toLocaleString()}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
