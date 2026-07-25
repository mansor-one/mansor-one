import { NextResponse } from 'next/server'
import { requireInternalToolAccess } from '@/lib/auth/internal-tools'
import { requireHouseholdGmailManager } from '@/lib/auth/require-household-gmail-manager'
import { getGoogleAccessToken } from '@/lib/gmail/client'
import { createServerSupabase } from '@/lib/supabase/server'

type GmailListMessage = {
  id: string
}

type GmailListResponse = {
  messages?: GmailListMessage[]
}

type GmailHeader = {
  name: string
  value: string
}

type GmailMessageDetail = {
  snippet?: string
  payload?: {
    headers?: GmailHeader[]
  }
}

function getHeader(headers: GmailHeader[], name: string) {
  return (
    headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    ''
  )
}

function categorize(text: string) {
  const s = text.toLowerCase()

  if (s.includes('escambron') || s.includes('parking')) return 'Parking'
  if (s.includes('fuel') || s.includes('gas')) return 'Gasolina'
  if (s.includes('yadrian')) return 'Barbero'
  if (s.includes('mcdonald') || s.includes('burger')) return 'Fast Food'
  if (s.includes('walgreens') || s.includes('farmacia')) return 'Farmacia'
  if (s.includes('nintendo') || s.includes('apple')) return 'Suscripciones'
  if (s.includes('soraya')) return 'Familia'
if (s.includes('andres merced')) return 'Familia / Reembolso'
if (s.includes('excell')) return 'Revisar'

  return 'Revisar'
}

function parseAthEmail(subject: string, snippet: string) {
  const text = `${subject} ${snippet}`

  const amountMatch = text.match(/\$([\d,]+(?:\.\d{2})?)/)
  const amount = amountMatch ? Number(amountMatch[1].replace(',', '')) : null

  let direction = 'unknown'
  let transactionType = 'unknown'
  let counterparty = ''

  if (/transferred between cards/i.test(subject)) {
    direction = 'internal'
    transactionType = 'internal_transfer'
  } else if (/you paid/i.test(subject) || /payment receipt/i.test(subject)) {
    direction = 'sent'
    transactionType = 'payment'
  } else if (/received|from/i.test(subject)) {
    direction = 'received'
    transactionType = 'transfer_received'
  } else if (/to /i.test(subject)) {
    direction = 'sent'
    transactionType = 'transfer_sent'
  }

  const sentToMatch = text.match(/Sent to:\s*(.*?)\s*Date:/i)
  const sentByMatch = text.match(/Sent by:\s*(.*?)\s*Date:/i)
  const paidToMatch = subject.match(/You paid \$[\d,.]+ to (.*)/i)
  const transferToMatch = subject.match(/Transfer receipt:\s*\$[\d,.]+\s*to\s*(.*)/i)
  const transferFromMatch = subject.match(/Transfer receipt:\s*\$[\d,.]+\s*from\s*(.*)/i)

  counterparty =
    sentToMatch?.[1] ||
    sentByMatch?.[1] ||
    paidToMatch?.[1] ||
    transferToMatch?.[1] ||
    transferFromMatch?.[1] ||
    ''

  counterparty = counterparty
    .replace(/\s+/g, ' ')
    .replace(/-\s*\(\d{3}\).*$/, '')
    .trim()
if (!counterparty && subject.toLowerCase().startsWith('payment receipt:')) {
  counterparty = subject.replace(/payment receipt:\s*/i, '').trim()
}
  const messageMatch = text.match(/Message:\s*(.*?)\s*(If you didn't|If you didn&#39;t|As a reminder|Thanks)/i)
  const message = messageMatch?.[1]?.trim() || ''

  return {
    subject,
    amount,
    direction,
    transactionType,
    counterparty,
    message,
    suggestedCategory: categorize(`${subject} ${counterparty} ${message}`),
    rawSnippet: snippet,
  }
}

export async function GET() {
  const { supabase } = await createServerSupabase()
  const auth = await requireInternalToolAccess(supabase, 'gmail_diagnostic')
  if (!auth.ok) return auth.response
  const manager = await requireHouseholdGmailManager(supabase)
  if (!manager.ok) return manager.response

  const accessToken = await getGoogleAccessToken()

  const q = encodeURIComponent('from:info@notifications.evertecinc.com')
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=10`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  const listData = (await listRes.json()) as GmailListResponse

  const parsed = await Promise.all(
    (listData.messages || []).map(async (msg) => {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      const detail = (await detailRes.json()) as GmailMessageDetail
      const headers = detail.payload?.headers || []
      const subject = getHeader(headers, 'Subject')
      const date = getHeader(headers, 'Date')

      return {
        gmailMessageId: msg.id,
        date,
        ...parseAthEmail(subject, detail.snippet || ''),
      }
    })
  )

  return NextResponse.json({
    ok: true,
    count: parsed.length,
    parsed,
  })
}
