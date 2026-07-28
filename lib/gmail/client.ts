import 'server-only'

export async function getGoogleAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail integration is unavailable')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error('Gmail authorization failed')
  }

  const data = (await response.json()) as { access_token?: unknown }
  if (typeof data.access_token !== 'string') {
    throw new Error('Gmail authorization failed')
  }

  return data.access_token
}
