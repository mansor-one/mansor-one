import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLoginPage = request.nextUrl.pathname.startsWith('/login')

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/',
    '/accounts/:path*',
    '/advisor/:path*',
    '/assets/:path*',
    '/cards/:path*',
    '/cashflow/:path*',
    '/future-obligations/:path*',
    '/goals/:path*',
    '/health-score/:path*',
    '/history/:path*',
    '/imports/:path*',
    '/income/:path*',
    '/merchant-rules/:path*',
    '/payment-instances/:path*',
    '/payments/:path*',
    '/plaid/:path*',
    '/plaid-import/:path*',
    '/priorities/:path*',
    '/quick-entry/:path*',
    '/spending/:path*',
    '/timeline/:path*',
  ],
}