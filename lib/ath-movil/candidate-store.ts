import 'server-only'

import type { getSupabaseAdmin } from '@/lib/supabase/admin'
import { ATH_MATCH_SCORE_VERSION, buildAthMatchCandidates } from './matcher'
import type { ParsedAthEmail } from './types'

type AdminClient = ReturnType<typeof getSupabaseAdmin>

export async function refreshAthCandidates({
  admin,
  householdId,
  emailId,
  parsed,
  evaluatedAt,
}: {
  admin: AdminClient
  householdId: string
  emailId: string
  parsed: ParsedAthEmail
  evaluatedAt: string
}) {
  if (!parsed.financialEvidence || parsed.amountCents === null || !parsed.occurredAt) return 0
  const windowStart = new Date(new Date(parsed.occurredAt).getTime() - 3 * 86_400_000).toISOString().slice(0, 10)
  const windowEnd = new Date(new Date(parsed.occurredAt).getTime() + 3 * 86_400_000).toISOString().slice(0, 10)
  const { data: imports, error: importsError } = await admin.from('plaid_imports')
    .select('id, household_id, amount, transaction_date, merchant, account_name, account_mask, pending, transaction_status, removed_at, superseded_at')
    .eq('household_id', householdId)
    .gte('transaction_date', windowStart)
    .lte('transaction_date', windowEnd)
  if (importsError) throw new Error('Plaid candidates could not be read')
  const matches = buildAthMatchCandidates({ ...parsed, id: emailId, householdId }, (imports || []).map((item) => ({
    id: item.id,
    householdId: item.household_id,
    amountCents: Math.round(Math.abs(Number(item.amount || 0)) * 100),
    signedAmountCents: Math.round(Number(item.amount || 0) * 100),
    transactionDate: item.transaction_date || '',
    merchant: item.merchant,
    accountName: item.account_name,
    accountMask: item.account_mask,
    pending: item.pending,
    transactionStatus: item.transaction_status,
    removedAt: item.removed_at,
    supersededAt: item.superseded_at,
  })))
  const existingResult = await admin.from('ath_movil_match_candidates')
    .select('id, plaid_import_id, status')
    .eq('ath_email_id', emailId)
  if (existingResult.error) throw new Error('Existing ATH candidates could not be read')
  const existing = existingResult.data || []
  if (existing.some((item) => item.status === 'confirmed')) return 0

  const reasonSet = (match: (typeof matches)[number]) => [
    ...match.reasons,
    {
      code: 'ambiguity',
      positive: !match.ambiguous,
      points: 0,
      message: match.ambiguous
        ? 'Existen alternativas con puntuación similar.'
        : 'No hay otra alternativa con puntuación similar.',
    },
  ]
  const existingByPair = new Map(existing.map((item) => [item.plaid_import_id, item.status]))
  const newRows = matches.filter((match) => !existingByPair.has(match.plaidImportId)).map((match) => ({
    household_id: householdId,
    ath_email_id: emailId,
    plaid_import_id: match.plaidImportId,
    score: match.score,
    score_version: ATH_MATCH_SCORE_VERSION,
    reasons: reasonSet(match),
    rank: match.rank,
    status: 'suggested',
    evaluated_at: evaluatedAt,
  }))
  let created = 0
  if (newRows.length) {
    const { data, error } = await admin.from('ath_movil_match_candidates').insert(newRows).select('id')
    if (error) throw new Error('ATH candidates could not be created')
    created = data?.length || 0
  }
  for (const match of matches) {
    const candidate = existing.find((item) => item.plaid_import_id === match.plaidImportId)
    if (!candidate || !['suggested', 'stale'].includes(candidate.status)) continue
    const { error } = await admin.from('ath_movil_match_candidates').update({
      score: match.score,
      score_version: ATH_MATCH_SCORE_VERSION,
      reasons: reasonSet(match),
      rank: match.rank,
      evaluated_at: evaluatedAt,
      status: 'suggested',
    }).eq('id', candidate.id).in('status', ['suggested', 'stale'])
    if (error) throw new Error('ATH candidate score could not be updated')
  }
  const activePairs = matches.map((match) => match.plaidImportId)
  const staleIds = existing
    .filter((item) => item.status === 'suggested' && !activePairs.includes(item.plaid_import_id))
    .map((item) => item.id)
  if (staleIds.length) {
    const { error } = await admin.from('ath_movil_match_candidates')
      .update({ status: 'stale', evaluated_at: evaluatedAt })
      .in('id', staleIds)
      .eq('status', 'suggested')
    if (error) throw new Error('Stale ATH candidates could not be updated')
  }
  return created
}
