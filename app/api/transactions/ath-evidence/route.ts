import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/requireApiUser'
import { createServerSupabase } from '@/lib/supabase/server'
import { resolveOptionalAthEvidenceRows } from '@/lib/ath-movil/schema-availability'

export async function GET(request: Request) {
  const { supabase } = await createServerSupabase()
  const auth = await requireApiUser(supabase)
  if (!auth.ok) return auth.response
  const { data: membership } = await supabase.from('household_members')
    .select('household_id')
    .eq('auth_user_id', auth.user.id)
    .eq('active', true)
    .maybeSingle()
  if (!membership?.household_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const quickEntryId = new URL(request.url).searchParams.get('quickEntryId')
  if (!quickEntryId) return NextResponse.json({ error: 'Falta la transacción.' }, { status: 400 })
  const { data: entry, error: entryError } = await supabase.from('quick_entries')
    .select('plaid_transaction_id, household_id')
    .eq('id', quickEntryId)
    .eq('household_id', membership.household_id)
    .maybeSingle()
  if (entryError) return NextResponse.json({ error: 'No se pudo cargar la transacción.' }, { status: 500 })
  if (!entry?.plaid_transaction_id) return NextResponse.json({ evidence: [] })
  const { data: imported, error: importError } = await supabase.from('plaid_imports')
    .select('id')
    .eq('household_id', entry.household_id)
    .eq('plaid_transaction_id', entry.plaid_transaction_id)
    .maybeSingle()
  if (importError) return NextResponse.json({ error: 'No se pudo cargar la transacción importada.' }, { status: 500 })
  if (!imported) return NextResponse.json({ evidence: [] })
  const matchesResult = await supabase.from('ath_movil_match_candidates')
    .select('id, ath_email_id, score, rank, status, reasons, reviewed_at, rejection_reason')
    .eq('plaid_import_id', imported.id)
    .order('rank')
  let matches
  try {
    const resolved = resolveOptionalAthEvidenceRows(
      matchesResult,
      'ath_movil_match_candidates'
    )
    if (!resolved.schemaAvailable) return NextResponse.json({ evidence: [] })
    matches = resolved.rows
  } catch {
    return NextResponse.json({ error: 'No se pudo cargar el contexto ATH.' }, { status: 500 })
  }
  const emailIds = [...new Set(matches.map((match) => match.ath_email_id))]
  const emailsResult = emailIds.length ? await supabase.from('ath_movil_emails')
    .select('id, occurred_at, direction, counterparty_name, counterparty_phone_last4, message, reference')
    .in('id', emailIds) : { data: [], error: null }
  let emails
  try {
    const resolved = resolveOptionalAthEvidenceRows(emailsResult, 'ath_movil_emails')
    if (!resolved.schemaAvailable) return NextResponse.json({ evidence: [] })
    emails = resolved.rows
  } catch {
    return NextResponse.json({ error: 'No se pudo cargar el contexto ATH.' }, { status: 500 })
  }
  const byId = new Map(emails.map((email) => [email.id, email]))
  return NextResponse.json({ evidence: matches.map((match) => ({ ...match, email: byId.get(match.ath_email_id) || null })) })
}
