import { NextResponse } from 'next/server'
import { requireInternalToolAccess } from '@/lib/auth/internal-tools'
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

export async function GET() {
  const { supabase } = await createServerSupabase()
  const auth = await requireInternalToolAccess(supabase, 'gmail_diagnostic')
  if (!auth.ok) return auth.response

  const accessToken = await getGoogleAccessToken()

  const q = encodeURIComponent('from:info@notifications.evertecinc.com')
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=5`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  const listData = (await listRes.json()) as GmailListResponse

  const messages = await Promise.all(
    (listData.messages || []).map(async (msg) => {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      const detail = (await detailRes.json()) as GmailMessageDetail

      return {
        id: msg.id,
        snippet: detail.snippet,
        headers: detail.payload?.headers,
      }
    })
  )

  return NextResponse.json({
    ok: true,
    count: messages.length,
    messages,
  })
}
