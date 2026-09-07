import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'

function keyFor(rootSecret: string) {
  if (!rootSecret) throw new Error('A token encryption secret is required')
  return createHash('sha256').update(`mansor-one:gmail-refresh-token:v1:${rootSecret}`).digest()
}

export function encryptGoogleRefreshToken(refreshToken: string, rootSecret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, keyFor(rootSecret), iv)
  const encrypted = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()])
  return {
    encryptedRefreshToken: encrypted.toString('base64'),
    tokenIv: iv.toString('base64'),
    tokenAuthTag: cipher.getAuthTag().toString('base64'),
  }
}

export function decryptGoogleRefreshToken(encrypted: string, iv: string, authTag: string, rootSecret: string) {
  const decipher = createDecipheriv(ALGORITHM, keyFor(rootSecret), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
