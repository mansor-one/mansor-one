import { requireUser } from '@/lib/auth/requireUser'
import { getCardsSummary, type CardsSummary } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Nav from '../components/Nav'
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
    <main className="min-h-screen bg-neutral-950 p-4 text-neutral-100 md:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="space-y-4">
          <Nav />
          <div>
            <p className="text-sm text-neutral-400">
              Centro de control de crédito
            </p>
            <h1 className="text-4xl font-bold">Tarjetas</h1>
          </div>
        </header>

        {error && (
          <div className="rounded border border-red-700 bg-red-950/40 p-4 text-sm">
            {error}
          </div>
        )}

        {summary ? <CardsClient summary={summary} /> : null}
      </div>
    </main>
  )
}
