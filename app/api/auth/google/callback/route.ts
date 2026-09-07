import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { requireHouseholdGmailManager } from '@/lib/auth/require-household-gmail-manager'
import { getSafeRedirectPath } from '@/lib/security/safe-redirect'
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  verifyGoogleOAuthState,
} from '@/lib/security/oauth-state'
import { createClient } from '@/lib/supabase/server'
import { storeHouseholdGoogleRefreshToken } from '@/lib/gmail/token-store'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireHouseholdGmailManager(supabase)
  if (!auth.ok) return auth.response

  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value || null
  cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/api/auth/google/callback',
  })

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'Google integration is unavailable' },
      { status: 503 }
    )
  }

  const state = req.nextUrl.searchParams.get('state')
  if (
    !verifyGoogleOAuthState({
      state,
      cookieValue,
      userId: auth.user.id,
      secret: clientSecret,
    })
  ) {
    return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 })
  }

  if (req.nextUrl.searchParams.has('error')) {
    return NextResponse.redirect(
      new URL(
        getSafeRedirectPath('/ath-movil?gmail=authorization_denied'),
        req.url
      ),
      303
    )
  }

  const code = req.nextUrl.searchParams.get('code')

  if (!code) {
    return NextResponse.json({ error: 'Invalid OAuth response' }, { status: 400 })
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const tokenPayload = await tokenRes.json() as { refresh_token?: unknown }
  if (!tokenRes.ok || typeof tokenPayload.refresh_token !== 'string') {
    return NextResponse.json(
      { error: 'Google token exchange failed' },
      { status: 400 }
    )
  }

  try {
    await storeHouseholdGoogleRefreshToken(auth.householdId, tokenPayload.refresh_token)
  } catch {
    return NextResponse.json(
      { error: 'Google authorization could not be saved' },
      { status: 500 }
    )
  }

  return NextResponse.redirect(
    new URL(getSafeRedirectPath('/ath-movil?gmail=connected'), req.url),
    303
  )
}
