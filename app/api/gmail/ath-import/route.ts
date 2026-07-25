import { NextResponse } from 'next/server'
import { requireHouseholdGmailManager } from '@/lib/auth/require-household-gmail-manager'
import { getGoogleAccessToken } from '@/lib/gmail/client'
import { requireMutationOrigin } from '@/lib/security/request-origin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'

type GmailHeader = {
  name: string
  value?: string
}

type GmailMessageListItem = {
  id: string
}

type AthRule = {
  keyword: string
  category: string
}

function getHeader(headers: GmailHeader[], name: string) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

function categorize(text: string, rules: AthRule[] = []) {
  const s = text.toLowerCase()


 for (const rule of rules || []) {
    if (s.includes(rule.keyword.toLowerCase())) {
        
      return rule.category
    }
  }

  if (s.includes('coop_lares') || s.includes('coop lares') || s.includes('lares')) return 'Deuda - Lares'
  if (s.includes('farmacia')) return 'Farmacia'
  if (s.includes('comida')) return 'Comida / Familia'
  if (s.includes('nenas')) return 'Familia / Niñas'
  if (s.includes('cajita')) return 'Ahorro / Caja'
  if (s.includes('mcdonald') || s.includes('mc donald')) return 'Fast Food'
  if (s.includes('lab clin')) return 'Laboratorio'
  if (s.includes('texaco') || s.includes('1exaco')) return 'Gasolina'

  return 'Revisar'
}

function parseAthEmail(subject: string, snippet: string, rules: AthRule[] = []) {
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
    amount,
    direction,
    transaction_type: transactionType,
    counterparty,
    message,
    suggested_category: categorize(`${subject} ${counterparty} ${message}`, rules),
    raw_snippet: snippet,
  }
}

export async function POST(request: Request) {
  try {
    const originError = requireMutationOrigin(request)
    if (originError) return originError

    const { supabase } = await createServerSupabase()
    const auth = await requireHouseholdGmailManager(supabase)
    if (!auth.ok) return auth.response

    const supabaseAdmin = getSupabaseAdmin()
    const accessToken = await getGoogleAccessToken()
    const q = encodeURIComponent('from:info@notifications.evertecinc.com')

    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    const listData = await listRes.json()

    if (!listRes.ok) {
      return NextResponse.json(
        { ok: false, error: 'Gmail import failed' },
        { status: 502 }
      )
    }
const { data: rules, error: rulesError } = await supabaseAdmin
  .from('ath_movil_rules')
  .select('keyword, category')
  .eq('active', true)

if (rulesError) {
  return NextResponse.json(
    { ok: false, error: 'Gmail import configuration is unavailable' },
    { status: 500 }
  )
}

    const rows = await Promise.all(
      ((listData.messages || []) as GmailMessageListItem[]).map(async (msg) => {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=From`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )

        const detail = await detailRes.json()
        const headers = detail.payload?.headers || []
        const subject = getHeader(headers, 'Subject')
        const emailDate = getHeader(headers, 'Date')
        const parsed = parseAthEmail(subject, detail.snippet || '', rules || [])

        return {
	  user_id: auth.user.id,
	  household_id: auth.householdId,
  gmail_message_id: msg.id,
  email_date: emailDate ? new Date(emailDate).toISOString() : null,
  subject,
  ...parsed,
}
      })
    )

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        gmailFound: 0,
        inserted: 0,
        note: 'No ATH Movil messages found.',
      })
    }

    const { data, error } = await supabaseAdmin
      .from('ath_movil_emails')
     .upsert(rows, { onConflict: 'gmail_message_id' })
      .select('id')

    if (error) {
      return NextResponse.json(
        { ok: false, error: 'Gmail import could not be saved' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      gmailFound: rows.length,
      inserted: data?.length || 0,
      note: 'Duplicates were ignored by gmail_message_id.',
    })
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Gmail import failed' },
      { status: 500 }
    )
  }
}
