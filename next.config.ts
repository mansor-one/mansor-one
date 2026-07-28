import type { NextConfig } from "next";

function supabaseSources() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!value) return []

  try {
    const url = new URL(value)
    return [url.origin, `wss://${url.host}`]
  } catch {
    return []
  }
}

function contentSecurityPolicy(isDevelopment: boolean) {
  const scriptSources = [
    "'self'",
    "'unsafe-inline'",
    // React reconstructs server-side call stacks with eval in development.
    // Next.js documents this exception as development-only.
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
    'https://cdn.plaid.com',
  ]
  const connectSources = [
    "'self'",
    ...supabaseSources(),
    'https://cdn.plaid.com',
    'https://link.plaid.com',
    'https://production.plaid.com',
    'https://sandbox.plaid.com',
    'https://development.plaid.com',
    // Turbopack Fast Refresh uses a same-host WebSocket. These explicit local
    // sources cover browsers that do not treat CSP `self` as matching ws/wss.
    ...(isDevelopment
      ? ['ws://localhost:*', 'ws://127.0.0.1:*']
      : []),
  ]

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(' ')}`,
    [
      "frame-src",
      "https://cdn.plaid.com",
      "https://link.plaid.com",
      "https://production.plaid.com",
      "https://sandbox.plaid.com",
      "https://development.plaid.com",
    ].join(' '),
    // Local development is HTTP. Upgrading it to HTTPS would break the dev
    // server; Preview and Production retain transport upgrading.
    ...(!isDevelopment ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    const isDevelopment = process.env.NODE_ENV === 'development'
    const headers = [
      {
        key: 'Content-Security-Policy',
        value: contentSecurityPolicy(isDevelopment),
      },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
      { key: 'X-Frame-Options', value: 'DENY' },
    ]

    if (!isDevelopment) {
      headers.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      })
    }

    return [{ source: '/:path*', headers }]
  },
};

export default nextConfig;
