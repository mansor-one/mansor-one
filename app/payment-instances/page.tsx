import { requireUser } from '@/lib/auth/requireUser'
import {
  getLegacyPaymentsReport,
  type LegacyPaymentsReport,
} from '@/lib/financial-engine'
import Nav from '../components/Nav'
import PaymentInstancesClient from './PaymentInstancesClient'

export const dynamic = 'force-dynamic'

export default async function PaymentInstancesPage() {
  const { supabase, user } = await requireUser()
  let message: string | null = null
  let report: LegacyPaymentsReport = {
    payments: [],
    liabilities: [],
  }

  try {
    report = await getLegacyPaymentsReport(supabase, user.id)
  } catch {
    message = 'No se pudieron cargar los pagos del mes en este momento.'
  }

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">📌 Pagos del Mes</h1>
      <Nav />

      <div className="border rounded p-4">
        Modo seguro: esta página legacy está en solo lectura. Los cambios de
        pagos se harán desde el flujo unificado de tarjetas y lifecycle.
      </div>

      <PaymentInstancesClient
        payments={report.payments}
        liabilities={report.liabilities}
        message={message}
      />
    </main>
  )
}
