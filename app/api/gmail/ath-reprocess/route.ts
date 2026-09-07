import { NextResponse } from 'next/server'
import { requireHouseholdGmailManager } from '@/lib/auth/require-household-gmail-manager'
import { requireMutationOrigin } from '@/lib/security/request-origin'
import { createServerSupabase } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getGoogleAccessToken } from '@/lib/gmail/client'
import { extractGmailMimeTextWithAttachments } from '@/lib/ath-movil/gmail-mime'
import { athContentFingerprint, parseAthEmail } from '@/lib/ath-movil/parser'
import { refreshAthCandidates } from '@/lib/ath-movil/candidate-store'
import { enrichAthTransactionContexts } from '@/lib/transaction-intelligence/context-store'

type GmailHeader = { name: string; value?: string }
type GmailPayload = { headers?: GmailHeader[]; mimeType?: string; body?: { data?: string; attachmentId?: string }; parts?: GmailPayload[] }
type GmailMessage = { id: string; internalDate?: string; snippet?: string; payload?: GmailPayload }

function header(headers: GmailHeader[] = [], name: string) {
  return headers.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || ''
}

function receivedAt(message: GmailMessage) {
  if (message.internalDate && Number.isFinite(Number(message.internalDate))) {
    return new Date(Number(message.internalDate)).toISOString()
  }
  const value = new Date(header(message.payload?.headers, 'Date'))
  return Number.isNaN(value.getTime()) ? new Date().toISOString() : value.toISOString()
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
    const { data: rows, error } = await admin.from('ath_movil_emails')
      .select('id, gmail_message_id')
      .eq('household_id', auth.householdId)
      .neq('parse_status', 'parsed')
      .order('email_date', { ascending: false })
      .limit(200)
    if (error) throw new Error('Incomplete ATH evidence could not be read')

    const evaluatedAt = new Date().toISOString()
    let reprocessed = 0
    let ignored = 0
    let parsedCount = 0
    let candidatesCreated = 0
    const processedEmailIds: string[] = []
    for (const row of rows || []) {
      const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${row.gmail_message_id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
      if (!detailRes.ok) throw new Error(`Gmail evidence refresh failed (${detailRes.status})`)
      const detail = await detailRes.json() as GmailMessage
      const mime = await extractGmailMimeTextWithAttachments(detail.payload, async (attachmentId) => {
        const attachmentRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${detail.id}/attachments/${attachmentId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        })
        if (!attachmentRes.ok) throw new Error(`Gmail attachment refresh failed (${attachmentRes.status})`)
        const attachment = await attachmentRes.json() as { data?: string }
        return attachment.data || null
      })
      const emailReceivedAt = receivedAt(detail)
      const subject = header(detail.payload?.headers, 'Subject')
      const parsed = parseAthEmail({ subject, ...mime, snippet: detail.snippet || null, emailReceivedAt })
      const update = await admin.from('ath_movil_emails').update({
        subject,
        email_date: emailReceivedAt,
        occurred_at: parsed.occurredAt,
        timezone: parsed.timezone,
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
        content_fingerprint: athContentFingerprint(auth.householdId, parsed),
        parsed_fields: parsed.fields,
        raw_snippet: (detail.snippet || '').slice(0, 280),
        is_ignored: !parsed.financialEvidence,
        exclude_from_spending: !parsed.financialEvidence,
      }).eq('id', row.id).eq('household_id', auth.householdId)
      if (update.error) throw new Error('ATH evidence could not be reprocessed')
      reprocessed += 1
      processedEmailIds.push(row.id)
      if (!parsed.financialEvidence) ignored += 1
      if (parsed.parseStatus === 'parsed') parsedCount += 1
      candidatesCreated += await refreshAthCandidates({
        admin,
        householdId: auth.householdId,
        emailId: row.id,
        parsed,
        evaluatedAt,
      })
    }
    const contextResult = await enrichAthTransactionContexts({
      admin,
      householdId: auth.householdId,
      userId: auth.user.id,
      emailIds: processedEmailIds,
    })
    return NextResponse.json({
      ok: true,
      reprocessed,
      parsed: parsedCount,
      ignored,
      candidatesCreated,
      contextsEnriched: contextResult.enrichments,
      categorySuggestions: contextResult.suggestions,
      contextSchemaAvailable: contextResult.schemaAvailable,
    })
  } catch (error) {
    console.error('[ATH Evidence] Reprocessing failed safely.', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json({ ok: false, error: 'No pudimos reprocesar la evidencia ATH incompleta.' }, { status: 500 })
  }
}
