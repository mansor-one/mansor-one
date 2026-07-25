const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/

function decodedVariants(value: string) {
  const variants = [value]
  let current = value

  for (let index = 0; index < 2; index += 1) {
    try {
      const decoded = decodeURIComponent(current)
      if (decoded === current) break
      variants.push(decoded)
      current = decoded
    } catch {
      return null
    }
  }

  return variants
}

export function getSafeRedirectPath(
  input: string | null | undefined,
  fallback = '/'
) {
  const value = input?.trim()
  if (!value) return fallback

  const variants = decodedVariants(value)
  if (
    !variants ||
    variants.some(
      (variant) =>
        !variant.startsWith('/') ||
        variant.startsWith('//') ||
        CONTROL_OR_BACKSLASH.test(variant)
    )
  ) {
    return fallback
  }

  try {
    const parsed = new URL(value, 'https://mansor.invalid')
    if (parsed.origin !== 'https://mansor.invalid') return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}
