import { requireUser } from '@/lib/auth/requireUser'
import { getLedgerSummary } from '@/lib/financial-engine'
import Nav from '../components/Nav'
import PlaidImportClient from './PlaidImportClient'

export const dynamic = 'force-dynamic'

export default async function PlaidImportPage() {
  const { supabase, user } = await requireUser()
  const summary = await getLedgerSummary(supabase, user.id)

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">📥 Import / Review Queue</h1>

      <Nav />

      <p className="border rounded p-4">
        Plaid import rows are candidates only. Confirmed spending lives in
        Ledger Summary confirmedLedgerEntries.
      </p>

      <PlaidImportClient summary={summary} />
    </main>
  )
}
