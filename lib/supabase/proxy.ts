import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  evaluateInternalToolAccess,
  internalToolSurfaceForPath,
} from '@/lib/auth/internal-tools'
import { getSafeRedirectPath } from '@/lib/auth/redirects'
import { getSupabasePublishableKey, getSupabaseUrl } from './config'

const PUBLIC_ROUTES = new Set(['/login'])

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.has(pathname)
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })

          response = NextResponse.next({ request })

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })

          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value)
          })
        },
      },
    }
  )

  const { data: claims } = await supabase.auth.getClaims()

  const pathname = request.nextUrl.pathname
  const internalSurface = internalToolSurfaceForPath(pathname)

  if (!claims && !isPublicRoute(pathname)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set(
      'next',
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    )
    return NextResponse.redirect(redirectUrl)
  }

  if (claims && internalSurface) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const decision = evaluateInternalToolAccess({
      surface: internalSurface,
      userEmail: user?.email,
    })

    if (!decision.allowed) {
      return new NextResponse('Not found', { status: decision.status })
    }
  }

  if (claims && pathname === '/login') {
    const next = request.nextUrl.searchParams.get('next')
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = getSafeRedirectPath(next)
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }

  return response
}
