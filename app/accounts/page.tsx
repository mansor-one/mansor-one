import { requireUser } from '@/lib/auth/requireUser'
import {
  getLegacyAccountsReport,
  type LegacyAccountsReport,
} from '@/lib/financial-engine'
import Nav from '../components/Nav'
import AccountsClient from './AccountsClient'

export const dynamic = 'force-dynamic'

export default async function AccountsPage() {
  const { supabase, user } = await requireUser()
  let message: string | null = null
  let report: LegacyAccountsReport = {
    manualAccounts: [],
    plaidAccounts: [],
  }

  try {
    report = await getLegacyAccountsReport(supabase, user.id)
  } catch {
    message = 'No se pudieron cargar las cuentas en este momento.'
  }

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">🏦 Cuentas</h1>

      <Nav />

      <div className="border rounded p-4">
        Modo seguro: esta página legacy está en solo lectura. La actualización
        de balances debe pasar por APIs autenticadas y scoped por usuario.
      </div>

      <button className="border rounded p-3" disabled>
        🔄 Actualizar balances Plaid deshabilitado
      </button>

      <AccountsClient
        accounts={report.manualAccounts}
        plaidAccounts={report.plaidAccounts}
        message={message}
      />
    </main>
  )
}
