import { requireUser } from '@/lib/auth/requireUser'
import { getCardsSummary, type CardsSummary } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import AppShell from '../components/AppShell'
import CardsClient from './CardsClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Tarjetas | Mansor One',
}

export default async function CardsPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  let summary: CardsSummary | null = null
  let error: string | null = null

  try {
    summary = await getCardsSummary(supabase, user.id)
  } catch (caughtError) {
    error =
      caughtError instanceof Error
        ? caughtError.message
        : 'No se pudieron cargar las tarjetas.'
  }

  return (
    <AppShell
      header={{
        eyebrow: 'Centro de crédito',
        title: 'Tarjetas',
        subtitle:
          'Saldos, límites, pagos mínimos y señales de riesgo de las tarjetas familiares.',
      }}
    >
      {error && (
        <div className="rounded border border-red-700 bg-red-950/40 p-4 text-sm">
          {error}
        </div>
      )}

      {summary ? <CardsClient summary={summary} /> : null}
    </AppShell>
  )
}
