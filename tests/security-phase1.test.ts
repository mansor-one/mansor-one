import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createGoogleOAuthState,
  verifyGoogleOAuthState,
} from '../lib/security/oauth-state.ts'
import { evaluateMutationOrigin } from '../lib/security/request-origin.ts'
import { getSafeRedirectPath } from '../lib/security/safe-redirect.ts'
import { isHouseholdGmailManagerMembership } from '../lib/auth/gmail-manager-policy.ts'
import { parseAdminEmailAllowlist } from '../lib/security/admin-allowlist.ts'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('OAuth state is signed, short-lived, user-bound, and one-time at the route boundary', () => {
  const secret = 'test-secret'
  const now = Date.parse('2026-07-24T12:00:00Z')
  const created = createGoogleOAuthState({ userId: 'owner-a', secret, now })

  assert.equal(
    verifyGoogleOAuthState({
      state: created.state,
      cookieValue: created.cookieValue,
      userId: 'owner-a',
      secret,
      now: now + 1_000,
    }),
    true
  )
  assert.equal(
    verifyGoogleOAuthState({
      state: 'wrong',
      cookieValue: created.cookieValue,
      userId: 'owner-a',
      secret,
      now: now + 1_000,
    }),
    false
  )
  assert.equal(
    verifyGoogleOAuthState({
      state: created.state,
      cookieValue: created.cookieValue,
      userId: 'different-user',
      secret,
      now: now + 1_000,
    }),
    false
  )
  assert.equal(
    verifyGoogleOAuthState({
      state: created.state,
      cookieValue: created.cookieValue,
      userId: 'owner-a',
      secret,
      now: now + 11 * 60_000,
    }),
    false
  )
  assert.equal(
    verifyGoogleOAuthState({
      state: created.state,
      cookieValue: `${created.cookieValue}tampered`,
      userId: 'owner-a',
      secret,
      now: now + 1_000,
    }),
    false
  )

  const callback = source('app/api/auth/google/callback/route.ts')
  assert.match(callback, /maxAge:\s*0/)
  assert.ok(
    callback.indexOf('maxAge: 0') <
      callback.indexOf('fetch(\'https://oauth2.googleapis.com/token\'')
  )
})

test('Google OAuth and Gmail import enforce the owner boundary before privileged work', () => {
  const start = source('app/api/auth/google/start/route.ts')
  const callback = source('app/api/auth/google/callback/route.ts')
  const gmailImport = source('app/api/gmail/ath-import/route.ts')

  for (const route of [start, callback, gmailImport]) {
    assert.match(route, /requireHouseholdGmailManager/)
  }
  assert.match(start, /state,/)
  assert.match(callback, /verifyGoogleOAuthState/)
  assert.doesNotMatch(gmailImport, /export async function GET/)
  assert.match(gmailImport, /export async function POST/)
  assert.ok(
    gmailImport.indexOf('requireHouseholdGmailManager') <
      gmailImport.indexOf('getSupabaseAdmin()')
  )
  assert.match(gmailImport, /household_id:\s*auth\.householdId/)
  assert.doesNotMatch(gmailImport, /error:\s*listData/)
})

test('only an active household owner is a shared Gmail manager', () => {
  assert.equal(
    isHouseholdGmailManagerMembership({
      household_id: 'household-a',
      role: 'owner',
      active: true,
    }),
    true
  )
  assert.equal(
    isHouseholdGmailManagerMembership({
      household_id: 'household-a',
      role: 'member',
      active: true,
    }),
    false
  )
  assert.equal(
    isHouseholdGmailManagerMembership({
      household_id: 'household-a',
      role: 'viewer',
      active: true,
    }),
    false
  )
  assert.equal(
    isHouseholdGmailManagerMembership({
      household_id: 'household-a',
      role: 'owner',
      active: false,
    }),
    false
  )
})

test('mutation Origin policy allows configured/local origins and fails closed remotely', () => {
  const prior = process.env.MANSOR_ALLOWED_ORIGINS
  const priorVercelUrl = process.env.VERCEL_URL
  process.env.MANSOR_ALLOWED_ORIGINS = 'https://app.mansor.example'

  try {
    assert.equal(
      evaluateMutationOrigin(
        new Request('https://app.mansor.example/api/test', {
          headers: {
            origin: 'https://app.mansor.example',
            'sec-fetch-site': 'same-origin',
          },
        }),
        'production'
      ).allowed,
      true
    )
    assert.equal(
      evaluateMutationOrigin(
        new Request('https://app.mansor.example/api/test', {
          headers: { origin: 'https://evil.example' },
        }),
        'production'
      ).allowed,
      false
    )
    assert.equal(
      evaluateMutationOrigin(
        new Request('https://app.mansor.example/api/test'),
        'production'
      ).allowed,
      false
    )
    assert.equal(
      evaluateMutationOrigin(
        new Request('http://localhost:3000/api/test'),
        'development'
      ).allowed,
      true
    )
    assert.equal(
      evaluateMutationOrigin(
        new Request('https://app.mansor.example/api/test', {
          headers: { origin: 'not a valid origin' },
        }),
        'preview'
      ).allowed,
      false
    )

    process.env.MANSOR_ALLOWED_ORIGINS =
      'https://app.mansor.example,not-an-origin'
    assert.equal(
      evaluateMutationOrigin(
        new Request('https://app.mansor.example/api/test', {
          headers: { origin: 'https://app.mansor.example' },
        }),
        'production'
      ).allowed,
      false
    )

    delete process.env.MANSOR_ALLOWED_ORIGINS
    process.env.VERCEL_URL = 'unconfigured-preview.vercel.app'
    assert.equal(
      evaluateMutationOrigin(
        new Request('https://unconfigured-preview.vercel.app/api/test', {
          headers: { origin: 'https://unconfigured-preview.vercel.app' },
        }),
        'preview'
      ).allowed,
      false
    )
  } finally {
    if (prior === undefined) delete process.env.MANSOR_ALLOWED_ORIGINS
    else process.env.MANSOR_ALLOWED_ORIGINS = prior
    if (priorVercelUrl === undefined) delete process.env.VERCEL_URL
    else process.env.VERCEL_URL = priorVercelUrl
  }
})

test('all financial/integration mutation routes use the central Origin boundary', () => {
  const routes = [
    'app/api/cards/confirm-payment/route.ts',
    'app/api/cards/create-manual-profile/route.ts',
    'app/api/cards/create-schedule/route.ts',
    'app/api/cards/update-profile/route.ts',
    'app/api/gmail/ath-import/route.ts',
    'app/api/ledger/category-conflict/route.ts',
    'app/api/ledger/duplicate-resolution/route.ts',
    'app/api/ledger/update-category/route.ts',
    'app/api/obligations/confirm-paid/route.ts',
    'app/api/obligations/reconciliation-candidate/route.ts',
    'app/api/plaid/create-link-token/route.ts',
    'app/api/plaid/update-link-token/route.ts',
    'app/api/plaid/complete-update/route.ts',
    'app/api/plaid/exchange-public-token/route.ts',
    'app/api/plaid/import-transaction/route.ts',
    'app/api/plaid/revoke-connection/route.ts',
    'app/api/plaid/sync-accounts/route.ts',
    'app/api/plaid/sync-imports/route.ts',
    'app/api/plaid/sync/route.ts',
    'app/api/review-queue/confirm-duplicate/route.ts',
    'app/api/review-queue/confirm-import/route.ts',
    'app/api/review-queue/decide-transaction/route.ts',
    'app/api/review-queue/resolve-duplicate/route.ts',
  ]

  for (const route of routes) {
    const contents = source(route)
    assert.match(contents, /requireMutationOrigin/, route)
    assert.match(contents, /if \(originError\) return originError/, route)
  }
})

test('safe redirects reject absolute, scheme-relative, backslash, and encoded bypasses', () => {
  assert.equal(getSafeRedirectPath('/history?month=7#items'), '/history?month=7#items')
  assert.equal(getSafeRedirectPath('https://evil.example'), '/')
  assert.equal(getSafeRedirectPath('//evil.example'), '/')
  assert.equal(getSafeRedirectPath('/\\evil.example'), '/')
  assert.equal(getSafeRedirectPath('/%2f%2fevil.example'), '/')
  assert.equal(getSafeRedirectPath('/%252f%252fevil.example'), '/')
  assert.equal(getSafeRedirectPath('javascript:alert(1)'), '/')
})

test('internal diagnostics fail closed without an explicit allowlist', () => {
  const policy = source('lib/auth/internal-tools.ts')
  assert.match(policy, /if \(allowlist\.size === 0\) return false/)
  assert.match(
    policy,
    /environment === 'preview' \|\| environment === 'development'/
  )
  assert.doesNotMatch(policy, /if \(allowlist\.size === 0\) return true/)
})

test('internal diagnostics reject malformed admin allowlists', () => {
  assert.equal(
    parseAdminEmailAllowlist('owner@example.com,not-an-email').size,
    0
  )
  assert.deepEqual(
    [...parseAdminEmailAllowlist(' OWNER@example.com,admin@example.com ')],
    ['owner@example.com', 'admin@example.com']
  )
})

test('service-role construction is centralized and browser imports are absent', () => {
  const admin = source('lib/supabase/admin.ts')
  assert.match(admin, /import 'server-only'/)
  assert.match(admin, /SUPABASE_SERVICE_ROLE_KEY/)

  const privilegedFiles = [
    'app/api/gmail/ath-import/route.ts',
    'app/api/plaid/exchange-public-token/route.ts',
    'app/api/plaid/connections/route.ts',
    'app/api/plaid/sync-imports/route.ts',
    'app/api/plaid/sync/daily/route.ts',
    'lib/plaid-sync/orchestrator.ts',
  ]
  for (const file of privilegedFiles) {
    assert.doesNotMatch(source(file), /SUPABASE_SERVICE_ROLE_KEY/, file)
  }
})

test('security headers and direct page guards are configured', () => {
  const config = source('next.config.ts')
  for (const header of [
    'Content-Security-Policy',
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'X-Frame-Options',
  ]) {
    assert.match(config, new RegExp(header))
  }
  assert.match(config, /frame-ancestors 'none'/)
  assert.doesNotMatch(config, /\s\*\s/)
  assert.match(config, /contentSecurityPolicy\(isDevelopment\)/)
  assert.match(
    config,
    /isDevelopment \? \["'unsafe-eval'"\] : \[\]/
  )
  assert.match(config, /isDevelopment[\s\S]*ws:\/\/localhost:\*/)
  assert.match(config, /!isDevelopment \? \['upgrade-insecure-requests'\] : \[\]/)
  assert.match(source('app/imports/page.tsx'), /await requireUser\(\)/)
  assert.match(source('app/lab/page.tsx'), /await requireUser\(\)/)
})
