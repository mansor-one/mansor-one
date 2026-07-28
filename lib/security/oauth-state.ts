import crypto from 'node:crypto'

const STATE_VERSION = 1
export const GOOGLE_OAUTH_STATE_COOKIE = 'mansor_google_oauth_state'
export const GOOGLE_OAUTH_STATE_TTL_SECONDS = 10 * 60

type StatePayload = {
  v: number
  nonce: string
  userId: string
  operation: 'gmail_connect'
  issuedAt: number
  expiresAt: number
}

function encode(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

function sign(encodedPayload: string, secret: string) {
  return crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url')
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  )
}

export function createGoogleOAuthState({
  userId,
  secret,
  now = Date.now(),
}: {
  userId: string
  secret: string
  now?: number
}) {
  const nonce = crypto.randomBytes(32).toString('base64url')
  const payload: StatePayload = {
    v: STATE_VERSION,
    nonce,
    userId,
    operation: 'gmail_connect',
    issuedAt: now,
    expiresAt: now + GOOGLE_OAUTH_STATE_TTL_SECONDS * 1000,
  }
  const encodedPayload = encode(JSON.stringify(payload))
  const signature = sign(encodedPayload, secret)

  return {
    state: nonce,
    cookieValue: `${encodedPayload}.${signature}`,
  }
}

export function verifyGoogleOAuthState({
  state,
  cookieValue,
  userId,
  secret,
  now = Date.now(),
}: {
  state: string | null
  cookieValue: string | null
  userId: string
  secret: string
  now?: number
}) {
  if (!state || !cookieValue) return false

  const [encodedPayload, suppliedSignature, extra] = cookieValue.split('.')
  if (!encodedPayload || !suppliedSignature || extra) return false

  const expectedSignature = sign(encodedPayload, secret)
  if (!safeEqual(suppliedSignature, expectedSignature)) return false

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as StatePayload

    return (
      payload.v === STATE_VERSION &&
      payload.operation === 'gmail_connect' &&
      payload.userId === userId &&
      payload.issuedAt <= now &&
      payload.expiresAt > now &&
      safeEqual(payload.nonce, state)
    )
  } catch {
    return false
  }
}
