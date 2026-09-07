import { NextResponse } from 'next/server'
import { requireHouseholdGmailManager } from '@/lib/auth/require-household-gmail-manager'
import { getGoogleAccessToken } from '@/lib/gmail/client'
import { requireMutationOrigin } from '@/lib/security/request-origin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { extractGmailMimeTextWithAttachments } from '@/lib/ath-movil/gmail-mime'
import { athContentFingerprint, parseAthEmail } from '@/lib/ath-movil/parser'
import { refreshAthCandidates } from '@/lib/ath-movil/candidate-store'
import { enrichAthTransactionContexts } from '@/lib/transaction-intelligence/context-store'

type GmailHeader = { name: string; value?: string }
type GmailMessageListItem = { id: string }
type GmailMessageListResponse = { messages?: GmailMessageListItem[]; nextPageToken?: string }
type GmailPayload = { headers?: GmailHeader[]; mimeType?: string; body?: { data?: string }; parts?: GmailPayload[] }
type GmailMessageDetail = {
  id: string
  internalDate?: string
  snippet?: string
  historyId?: string
  payload?: GmailPayload
}

function getHeader(headers: GmailHeader[] = [], name: string) {
  return headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || ''
}

function safeReceivedAt(detail: GmailMessageDetail, headerDate: string) {
  if (detail.internalDate && Number.isFinite(Number(detail.internalDate))) {
    return new Date(Number(detail.internalDate)).toISOString()
  }
  const date = new Date(headerDate)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

export async function POST(request: Request) {
  try {
    const originError = requireMutationOrigin(request)
    if (originError) return originError
    const { supabase } = await createServerSupabase()
    const auth = await requireHouseholdGmailManager(supabase)
    if (!auth.ok) return auth.response

    const admin = getSupabaseAdmin()
    const accessToken = await getGoogleAccessToken(auth.householdId)
    const now = new Date().toISOString()
    const { data: existingState, error: stateReadError } = await admin
      .from('gmail_evidence_sync_state')
      .select('id, last_email_at')
      .eq('household_id', auth.householdId)
      .maybeSingle()
    if (stateReadError) throw new Error('Gmail synchronization state could not be read')
    let state = existingState
    if (!state) {
      const stateInsert = await admin.from('gmail_evidence_sync_state')
        .insert({ household_id: auth.householdId, last_attempt_at: now })
        .select('id, last_email_at')
        .single()
      if (stateInsert.error) throw new Error('Gmail synchronization state could not be created')
      state = stateInsert.data
    }
    if (!state) return NextResponse.json({ ok: false, error: 'Gmail synchronization state is unavailable' }, { status: 500 })
    const attemptUpdate = await admin.from('gmail_evidence_sync_state').update({ last_attempt_at: now, updated_at: now }).eq('id', state.id)
    if (attemptUpdate.error) throw new Error('Gmail synchronization attempt could not be recorded')

    const afterSeconds = state.last_email_at
      ? Math.max(0, Math.floor(new Date(state.last_email_at).getTime() / 1000) - 1)
      : null
    const query = `from:info@notifications.evertecinc.com${afterSeconds === null ? '' : ` after:${afterSeconds}`}`
    const messages: GmailMessageListItem[] = []
    let pageToken: string | undefined
    for (let page = 0; page < 5; page += 1) {
      const params = new URLSearchParams({ q: query, maxResults: '100' })
      if (pageToken) params.set('pageToken', pageToken)
      const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
      const listData = await listRes.json() as GmailMessageListResponse
      if (!listRes.ok) return NextResponse.json({ ok: false, error: 'No pudimos leer los correos de ATH Móvil.' }, { status: 502 })
      messages.push(...(listData.messages || []))
      pageToken = listData.nextPageToken
      if (!pageToken) break
    }

    let newestEmailAt = state.last_email_at
    let inserted = 0
    let candidatesCreated = 0
    const processedEmailIds: string[] = []
    for (const message of messages) {
      const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
      if (!detailRes.ok) throw new Error(`Gmail message read failed (${detailRes.status})`)
      const detail = await detailRes.json() as GmailMessageDetail
      const headers = detail.payload?.headers || []
      const subject = getHeader(headers, 'Subject')
      const receivedAt = safeReceivedAt(detail, getHeader(headers, 'Date'))
      const mime = await extractGmailMimeTextWithAttachments(detail.payload, async (attachmentId) => {
        const attachmentRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}/attachments/${attachmentId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        })
        if (!attachmentRes.ok) throw new Error(`Gmail attachment read failed (${attachmentRes.status})`)
        const attachment = await attachmentRes.json() as { data?: string }
        return attachment.data || null
      })
      const parsed = parseAthEmail({ subject, ...mime, snippet: detail.snippet || null, emailReceivedAt: receivedAt })
      const fingerprint = athContentFingerprint(auth.householdId, parsed)
      const row = {
        user_id: auth.user.id,
        household_id: auth.householdId,
        gmail_connection_id: state.id,
        gmail_message_id: message.id,
        email_date: receivedAt,
        occurred_at: parsed.occurredAt,
        timezone: parsed.timezone,
        subject,
        amount: parsed.amountCents === null ? null : parsed.amountCents / 100,
        direction: parsed.direction,
        transaction_type: parsed.direction,
        counterparty: parsed.counterpartyName,
        counterparty_name: parsed.counterpartyName,
        counterparty_phone: parsed.counterpartyPhoneLast4,
        counterparty_phone_last4: parsed.counterpartyPhoneLast4,
        message: parsed.message,
        reference: parsed.reference,
        source_descriptor: parsed.sourceDescriptor,
        destination_descriptor: parsed.destinationDescriptor,
        parse_status: parsed.parseStatus,
        parser_version: parsed.parserVersion,
        content_fingerprint: fingerprint,
        parsed_fields: parsed.fields,
        is_ignored: !parsed.financialEvidence,
        exclude_from_spending: !parsed.financialEvidence,
        raw_snippet: (detail.snippet || '').slice(0, 280),
        imported_at: now,
      }
      const { data: existingEmail } = await admin.from('ath_movil_emails')
        .select('id, gmail_connection_id')
        .eq('household_id', auth.householdId)
        .eq('gmail_message_id', message.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (existingEmail && !existingEmail.gmail_connection_id) {
        const lineageUpdate = await admin.from('ath_movil_emails')
          .update({ gmail_connection_id: state.id })
          .eq('id', existingEmail.id)
          .eq('household_id', auth.householdId)
          .is('gmail_connection_id', null)
        if (lineageUpdate.error) throw new Error('ATH email lineage could not be updated')
      }
      const { data: email, error } = await admin.from('ath_movil_emails')
        .upsert(row, { onConflict: 'gmail_connection_id,gmail_message_id' })
        .select('id')
        .single()
      if (error || !email) throw new Error('ATH email evidence could not be saved')
      if (!existingEmail) inserted += 1
      processedEmailIds.push(email.id)
      if (!newestEmailAt || receivedAt > newestEmailAt) newestEmailAt = receivedAt

      candidatesCreated += await refreshAthCandidates({
        admin,
        householdId: auth.householdId,
        emailId: email.id,
        parsed,
        evaluatedAt: now,
      })
    }

    const contextResult = await enrichAthTransactionContexts({
      admin,
      householdId: auth.householdId,
      userId: auth.user.id,
      emailIds: processedEmailIds,
    })

    const successUpdate = await admin.from('gmail_evidence_sync_state').update({ last_email_at: newestEmailAt, last_success_at: now, updated_at: now }).eq('id', state.id)
    if (successUpdate.error) throw new Error('Gmail synchronization completion could not be recorded')
    return NextResponse.json({
      ok: true,
      gmailFound: messages.length,
      inserted,
      candidatesCreated,
      contextsEnriched: contextResult.enrichments,
      categorySuggestions: contextResult.suggestions,
      contextSchemaAvailable: contextResult.schemaAvailable,
      note: 'La evidencia Gmail fue importada sin modificar movimientos financieros.',
    })
  } catch (error) {
    console.error('[ATH Evidence] Import failed safely.', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json({ ok: false, error: 'No pudimos completar la importación de evidencia ATH.' }, { status: 500 })
  }
}
