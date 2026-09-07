import { isAllowedPlaidLogoUrl } from './visual-metadata.ts'

const DEFAULT_TIMEOUT_MS = 3_000
const DEFAULT_MAX_BYTES = 512 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export async function fetchValidatedPlaidLogo(url: string, options: {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
} = {}) {
  const fetchImpl = options.fetchImpl || fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const maxRedirects = options.maxRedirects ?? 1
  let current = url

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    if (!isAllowedPlaidLogoUrl(current)) throw new Error('Unapproved Plaid logo URL')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(current, { redirect: 'manual', signal: controller.signal })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location || redirects === maxRedirects) throw new Error('Unsafe Plaid logo redirect')
        current = new URL(location, current).toString()
        continue
      }
      if (!response.ok) throw new Error('Plaid logo unavailable')
      const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      if (!ALLOWED_TYPES.has(type)) throw new Error('Invalid Plaid logo content type')
      const declaredSize = Number(response.headers.get('content-length') || 0)
      if (declaredSize > maxBytes) throw new Error('Plaid logo is too large')
      if (!response.body) throw new Error('Plaid logo body is missing')
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maxBytes) {
          controller.abort()
          throw new Error('Plaid logo is too large')
        }
        chunks.push(value)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      return { bytes, contentType: type }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error('Plaid logo redirect limit exceeded')
}

export function decodeValidatedPlaidPng(value: string | null | undefined, maxBytes = DEFAULT_MAX_BYTES) {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null
  const bytes = Buffer.from(value, 'base64')
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.byteLength > maxBytes || signature.some((byte, index) => bytes[index] !== byte)) return null
  return bytes
}
