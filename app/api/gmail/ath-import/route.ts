import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/requireUser'
import { createServerSupabase } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getGoogleAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(data))
  return data.access_token
}

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

export async function GET() {
  try {
    const { supabase } = await createServerSupabase()
    const { user } = await requireUser(supabase)
    const accessToken = await getGoogleAccessToken()
    const q = encodeURIComponent('from:info@notifications.evertecinc.com')

    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    const listData = await listRes.json()

    if (!listRes.ok) {
      return NextResponse.json({ ok: false, error: listData }, { status: 400 })
    }
const { data: rules, error: rulesError } = await supabaseAdmin
  .from('ath_movil_rules')
  .select('keyword, category')
  .eq('active', true)

if (rulesError) {
  return NextResponse.json({ ok: false, error: rulesError }, { status: 400 })
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
  user_id: user.id,
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
      return NextResponse.json({ ok: false, error }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      gmailFound: rows.length,
      inserted: data?.length || 0,
      note: 'Duplicates were ignored by gmail_message_id.',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    )
  }
}
