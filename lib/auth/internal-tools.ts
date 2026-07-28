import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { parseAdminEmailAllowlist } from '@/lib/security/admin-allowlist'

export type InternalToolSurface = 'dev' | 'lab' | 'gmail_diagnostic'

export type DeploymentEnvironment = 'development' | 'preview' | 'production'

export type InternalToolAccessDecision = {
  allowed: boolean
  status: number
  reason: string
}

export function getDeploymentEnvironment(): DeploymentEnvironment {
  if (process.env.VERCEL_ENV === 'production') return 'production'
  if (process.env.VERCEL_ENV === 'preview') return 'preview'
  if (process.env.NODE_ENV === 'production') return 'production'
  return 'development'
}

export function internalToolSurfaceForPath(
  pathname: string
): InternalToolSurface | null {
  if (pathname === '/dev' || pathname.startsWith('/dev/')) return 'dev'
  if (pathname === '/lab' || pathname.startsWith('/lab/')) return 'lab'
  return null
}

function getAdminAllowlist() {
  return parseAdminEmailAllowlist(process.env.MANSOR_INTERNAL_ADMIN_EMAILS)
}

function isAllowedAdminEmail(email: string | null | undefined) {
  const allowlist = getAdminAllowlist()
  if (allowlist.size === 0) return false
  return Boolean(email && allowlist.has(email.toLowerCase()))
}

export function evaluateInternalToolAccess({
  surface,
  userEmail,
  environment = getDeploymentEnvironment(),
}: {
  surface: InternalToolSurface
  userEmail?: string | null
  environment?: DeploymentEnvironment
}): InternalToolAccessDecision {
  if (environment === 'production') {
    if (
      surface === 'lab' &&
      process.env.MANSOR_ENABLE_LAB_IN_PRODUCTION === 'true' &&
      getAdminAllowlist().size > 0 &&
      isAllowedAdminEmail(userEmail)
    ) {
      return { allowed: true, status: 200, reason: 'allowed' }
    }

    return {
      allowed: false,
      status: 404,
      reason: `${surface} tools are disabled in production`,
    }
  }

  if (
    (environment === 'preview' || environment === 'development') &&
    !isAllowedAdminEmail(userEmail)
  ) {
    return {
      allowed: false,
      status: 403,
      reason: 'Internal tool access is limited to allowed admins',
    }
  }

  return { allowed: true, status: 200, reason: 'allowed' }
}

export type InternalToolApiAuthResult =
  | {
      ok: true
      user: User
    }
  | {
      ok: false
      response: NextResponse<{ error: string }>
    }

export async function requireInternalToolAccess(
  supabase: SupabaseClient,
  surface: InternalToolSurface
): Promise<InternalToolApiAuthResult> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const decision = evaluateInternalToolAccess({
    surface,
    userEmail: user.email,
  })

  if (!decision.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: decision.reason },
        { status: decision.status }
      ),
    }
  }

  return { ok: true, user }
}
