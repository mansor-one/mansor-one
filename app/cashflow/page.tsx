import { requireUser } from '@/lib/auth/requireUser'
import { getTimelineProjection } from '@/lib/financial-engine'
import Nav from '../components/Nav'

export default async function CashflowPage() {
  const { supabase, user } = await requireUser()
  const timeline = await getTimelineProjection(supabase, user.id, { horizonDays: 45 })

  const { data: income } = await supabase
    .from('income_schedule')
    .select('*')

  const paymentsBeforeNextPay = timeline.events.filter((event) => event.type === 'payment')

  const totalDueBeforeNextPay =
    paymentsBeforeNextPay.reduce(
      (sum, payment) => sum + Math.abs(Number(payment.amount || 0)),
      0
    )

  return (
    <main className="p-8 space-y-6">
  <h1 className="text-3xl font-bold">💰 Cash Flow</h1>

  <Nav />

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
            <h3 className="font-bold">{payment.title}</h3>
            <p>${Math.abs(Number(payment.amount || 0)).toLocaleString()}</p>
            <p>Fecha: {payment.dueDate}</p>
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
