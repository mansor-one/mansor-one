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

export async function GET() {
  const { supabase } = await createServerSupabase()
  const auth = await requireInternalToolAccess(supabase, 'gmail_diagnostic')
  if (!auth.ok) return auth.response
  const manager = await requireHouseholdGmailManager(supabase)
  if (!manager.ok) return manager.response

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

      return { id: msg.id, hasSnippet: Boolean(detail.snippet) }
    })
  )

  return NextResponse.json({
    ok: true,
    count: messages.length,
    messages,
  })
}
