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

type CardsSearchParams = {
  cardId?: string
  action?: string
  from?: string
}

export default async function CardsPage({
  searchParams,
}: {
  searchParams?: Promise<CardsSearchParams>
}) {
  const params = (await searchParams) || {}
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  let summary: CardsSummary | null = null
  let error: string | null = null

  try {
    summary = await getCardsSummary(supabase, user.id)
    const { data: plaidAccounts } = await supabase.from('plaid_accounts')
      .select('plaid_account_id, connection_id').eq('user_id', user.id)
    const connectionIds = [...new Set((plaidAccounts || []).map((account) => account.connection_id).filter((id): id is string => Boolean(id)))]
    // Institution identity is presentation-only. Before the logo migration,
    // this query can fail without affecting the cards summary.
    let connectionVisuals: Array<{ id: string; institution_id: string | null }> = []
    if (connectionIds.length > 0) {
      try {
        const result = await supabase.from('plaid_connections')
          .select('id, institution_id').eq('user_id', user.id).in('id', connectionIds)
        connectionVisuals = result.data || []
      } catch {
        connectionVisuals = []
      }
    }
    const institutionByConnection = new Map(connectionVisuals.map((connection) => [connection.id, connection.institution_id]))
    const institutionByAccount = new Map((plaidAccounts || []).map((account) => [account.plaid_account_id, account.connection_id ? institutionByConnection.get(account.connection_id) || null : null]))
    summary.cards.forEach((card) => {
      card.issuerInstitutionId = card.plaidAccountId ? institutionByAccount.get(card.plaidAccountId) || null : null
    })
  } catch (caughtError) {
    error =
      caughtError instanceof Error
        ? caughtError.message
        : 'No se pudieron cargar las tarjetas.'
  }
  const requestedCardId = params.cardId || null
  const targetedCard = requestedCardId && summary
    ? summary.cards.find((card) =>
        card.manualCreditCardId === requestedCardId || card.plaidAccountId === requestedCardId
      ) || null
    : null
  const invalidTarget = Boolean(requestedCardId && !targetedCard)

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

      {summary ? (
        <CardsClient
          initialAction={params.action === 'edit' ? 'edit' : null}
          initialCardId={targetedCard?.id || null}
          invalidTarget={invalidTarget}
          returnToTimeline={params.from === 'timeline'}
          summary={summary}
        />
      ) : null}
    </AppShell>
  )
}
