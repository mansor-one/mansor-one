export type DeploymentEnvironment = 'development' | 'preview' | 'production'

function deploymentEnvironment(): DeploymentEnvironment {
  if (process.env.VERCEL_ENV === 'production') return 'production'
  if (process.env.VERCEL_ENV === 'preview') return 'preview'
  if (process.env.NODE_ENV === 'production') return 'production'
  return 'development'
}

function normalizedOrigin(value: string) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      return null
    }
    return url.origin
  } catch {
    return null
  }
}

function configuredOrigins(environment: DeploymentEnvironment) {
  const configured = process.env.MANSOR_ALLOWED_ORIGINS
  const explicitOrigins = configured === undefined ? [] : configured.split(',')
  const candidates = [...explicitOrigins, process.env.NEXT_PUBLIC_APP_URL]

  if (environment === 'development') {
    candidates.push('http://localhost:3000', 'http://127.0.0.1:3000')
  }

  const presentCandidates = candidates.filter(
    (value): value is string => value !== undefined
  )
  const normalized = presentCandidates.map((value) =>
    normalizedOrigin(value.trim())
  )

  // Explicit configuration is security-sensitive. An empty or malformed entry
  // invalidates the entire allowlist instead of silently broadening it.
  if (normalized.some((value) => value === null)) return new Set<string>()

  return new Set(normalized)
}

export function evaluateMutationOrigin(
  request: Pick<Request, 'headers'>,
  environment = deploymentEnvironment()
) {
  const originHeader = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')

  if (!originHeader) {
    return {
      allowed: environment === 'development' && fetchSite !== 'cross-site',
      reason: 'missing_origin',
    }
  }

  const origin = normalizedOrigin(originHeader)
  if (!origin) return { allowed: false, reason: 'malformed_origin' }
  if (fetchSite === 'cross-site') return { allowed: false, reason: 'cross_site' }

  const allowed = configuredOrigins(environment).has(origin)
  return { allowed, reason: allowed ? 'allowed' : 'origin_not_allowed' }
}

export function requireMutationOrigin(request: Pick<Request, 'headers'>) {
  const decision = evaluateMutationOrigin(request)
  if (decision.allowed) return null

  return Response.json({ error: 'Forbidden' }, { status: 403 })
}
