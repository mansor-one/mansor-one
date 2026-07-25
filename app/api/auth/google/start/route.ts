import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireHouseholdGmailManager } from '@/lib/auth/require-household-gmail-manager'
import {
  createGoogleOAuthState,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_STATE_TTL_SECONDS,
} from '@/lib/security/oauth-state'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const auth = await requireHouseholdGmailManager(supabase)
  if (!auth.ok) return auth.response

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'Google integration is unavailable' },
      { status: 503 }
    )
  }

  const { state, cookieValue } = createGoogleOAuthState({
    userId: auth.user.id,
    secret: clientSecret,
  })
  const cookieStore = await cookies()
  cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: GOOGLE_OAUTH_STATE_TTL_SECONDS,
    path: '/api/auth/google/callback',
    priority: 'high',
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    state,
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  )
}
