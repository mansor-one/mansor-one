import { requireUser } from '@/lib/auth/requireUser'
import {
  getLegacySpendableAccounts,
  type LegacySpendableAccount,
} from '@/lib/financial-engine'
import Nav from '../components/Nav'
import QuickEntryClient from './QuickEntryClient'

export const dynamic = 'force-dynamic'

export default async function QuickEntryPage() {
  const { supabase, user } = await requireUser()
  let accounts: LegacySpendableAccount[] = []
  let message: string | null = null

  try {
    accounts = await getLegacySpendableAccounts(supabase, user.id)
  } catch {
    message = 'No se pudieron cargar las cuentas disponibles.'
  }

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">⚡ Quick Entry</h1>

      <Nav />

      <div className="border rounded p-4">
        Modo seguro: esta página legacy está en solo lectura. Las entradas
        manuales deben pasar por un flujo autenticado antes de escribir al
        historial.
      </div>

      {message && <p>{message}</p>}

      <QuickEntryClient accounts={accounts} />
    </main>
  )
}
