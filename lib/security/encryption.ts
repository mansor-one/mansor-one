import crypto from 'crypto'

const algorithm = 'aes-256-gcm'

function getKey() {
  const secret = process.env.PLAID_TOKEN_ENCRYPTION_KEY

  if (!secret) {
    throw new Error('Missing PLAID_TOKEN_ENCRYPTION_KEY')
  }

  return crypto.createHash('sha256').update(secret).digest()
}

export function encrypt(text: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(algorithm, getKey(), iv)

  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ])

  const authTag = cipher.getAuthTag()

  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

export function decrypt(encrypted: string, iv: string, authTag: string) {
  const decipher = crypto.createDecipheriv(
    algorithm,
    getKey(),
    Buffer.from(iv, 'base64')
  )

  decipher.setAuthTag(Buffer.from(authTag, 'base64'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}