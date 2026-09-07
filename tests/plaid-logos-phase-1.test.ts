import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  initialLogoLoadState,
  logoFailedState,
  logoLoadedState,
  showLogoInitials,
} from '../lib/plaid/logo-load-state.ts'
import { decodeValidatedPlaidPng, fetchValidatedPlaidLogo } from '../lib/plaid/logo-proxy.ts'
import { isAllowedPlaidLogoUrl, selectMerchantVisualMetadata } from '../lib/plaid/visual-metadata.ts'
import { selectInstitutionMetadata } from '../lib/plaid/institution-metadata.ts'

const logoSchemaMigrationUrl = new URL(
  '../supabase/migrations/20260815192135_plaid_logos_phase_1.sql',
  import.meta.url
)
const logoPrivilegesMigrationUrl = new URL(
  '../supabase/migrations/20260815195007_plaid_logos_authenticated_write_privileges.sql',
  import.meta.url
)

function normalizedSqlList(value: string) {
  return value
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean)
}

function grantedColumns(sql: string, privilege: 'insert' | 'update', table: string) {
  const match = sql.match(
    new RegExp(
      `grant\\s+${privilege}\\s*\\(([^)]*)\\)\\s*on\\s+table\\s+public\\.${table}\\s+to\\s+authenticated`,
      'i'
    )
  )
  assert.ok(match, `missing authenticated ${privilege} grant for ${table}`)
  return normalizedSqlList(match[1])
}

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

test('Plaid logo allowlist requires exact HTTPS hosts without credentials or custom ports', () => {
  assert.equal(isAllowedPlaidLogoUrl('https://plaid-merchant-logos.plaid.com/a.png'), true)
  assert.equal(isAllowedPlaidLogoUrl('https://plaid-counterparty-logos.plaid.com/a.png'), true)
  assert.equal(isAllowedPlaidLogoUrl('http://plaid-merchant-logos.plaid.com/a.png'), false)
  assert.equal(isAllowedPlaidLogoUrl('https://evil.plaid-merchant-logos.plaid.com/a.png'), false)
  assert.equal(isAllowedPlaidLogoUrl('https://user:pass@plaid-merchant-logos.plaid.com/a.png'), false)
  assert.equal(isAllowedPlaidLogoUrl('https://plaid-merchant-logos.plaid.com:444/a.png'), false)
})

test('direct transaction metadata wins and HIGH/VERY_HIGH merchant counterparties are accepted', () => {
  const direct = selectMerchantVisualMetadata({ merchant_entity_id: 'direct', logo_url: 'https://plaid-merchant-logos.plaid.com/a.png', website: 'https://merchant.test', counterparties: [] } as never)
  assert.equal(direct?.merchant_logo_source, 'transaction')
  const counterparty = selectMerchantVisualMetadata({ merchant_entity_id: null, logo_url: null, website: null, counterparties: [{ entity_id: 'cp', type: 'merchant', confidence_level: 'VERY_HIGH', logo_url: 'https://plaid-counterparty-logos.plaid.com/a.png', website: null }] } as never)
  assert.equal(counterparty?.merchant_confidence, 'VERY_HIGH')
})

test('ambiguous or low-confidence merchant counterparties fall back', () => {
  const ambiguous = selectMerchantVisualMetadata({ counterparties: [
    { entity_id: 'one', type: 'merchant', confidence_level: 'HIGH', logo_url: 'https://plaid-counterparty-logos.plaid.com/1.png' },
    { entity_id: 'two', type: 'merchant', confidence_level: 'VERY_HIGH', logo_url: 'https://plaid-counterparty-logos.plaid.com/2.png' },
  ] } as never)
  assert.equal(ambiguous, null)
  assert.equal(selectMerchantVisualMetadata({ counterparties: [{ entity_id: 'one', type: 'merchant', confidence_level: 'MEDIUM', logo_url: 'https://plaid-counterparty-logos.plaid.com/1.png' }] } as never), null)
})

test('institution metadata accepts only valid PNG base64 and safe optional metadata', () => {
  const valid = selectInstitutionMetadata({ institution_id: 'ins_1', name: 'Bank', logo: png.toString('base64'), url: 'https://bank.test', primary_color: '#112233' })
  assert.equal(valid?.logo_base64, png.toString('base64'))
  assert.equal(selectInstitutionMetadata({ institution_id: 'ins_1', name: 'Bank', logo: 'invalid' })?.logo_base64, null)
  assert.equal(decodeValidatedPlaidPng('aW52YWxpZA=='), null)
})

test('logo proxy follows only approved redirects and validates type and body size', async () => {
  const redirecting = async (input: RequestInfo | URL) => String(input).includes('/start')
    ? new Response(null, { status: 302, headers: { location: 'https://plaid-counterparty-logos.plaid.com/end' } })
    : new Response(png, { headers: { 'content-type': 'image/png' } })
  const result = await fetchValidatedPlaidLogo('https://plaid-merchant-logos.plaid.com/start', { fetchImpl: redirecting as typeof fetch })
  assert.equal(result.bytes.byteLength, png.byteLength)
  await assert.rejects(() => fetchValidatedPlaidLogo('https://plaid-merchant-logos.plaid.com/start', { fetchImpl: (async () => new Response(null, { status: 302, headers: { location: 'https://example.com/logo.png' } })) as typeof fetch }))
  await assert.rejects(() => fetchValidatedPlaidLogo('https://plaid-merchant-logos.plaid.com/a', { fetchImpl: (async () => new Response('html', { headers: { 'content-type': 'text/html' } })) as typeof fetch }))
  await assert.rejects(() => fetchValidatedPlaidLogo('https://plaid-merchant-logos.plaid.com/a', { maxBytes: 4, fetchImpl: (async () => new Response(png, { headers: { 'content-type': 'image/png' } })) as typeof fetch }))
})

test('logo proxy enforces timeout', async () => {
  const stalled = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))) as typeof fetch
  await assert.rejects(() => fetchValidatedPlaidLogo('https://plaid-merchant-logos.plaid.com/a', { fetchImpl: stalled, timeoutMs: 5 }))
})

test('migration is additive and visual-only with minimum cache grants', () => {
  const migration = readFileSync(logoSchemaMigrationUrl, 'utf8')
  assert.match(migration, /add column if not exists institution_id text/)
  assert.match(migration, /create table public\.plaid_institution_assets/)
  assert.match(migration, /grant select, insert, update .* service_role/i)
  assert.doesNotMatch(migration, /\b(delete|truncate|trigger|references)\b\s+on/i)
  assert.doesNotMatch(migration, /\b(quick_entries|obligations|payments)\b/i)
})

test('authenticated Plaid writes are restricted to the audited pre-logo columns', () => {
  const migration = readFileSync(logoPrivilegesMigrationUrl, 'utf8')
  const visualColumns = [
    'institution_id',
    'merchant_entity_id',
    'merchant_logo_url',
    'merchant_website',
    'merchant_confidence',
    'merchant_logo_source',
  ]

  assert.deepEqual(grantedColumns(migration, 'update', 'plaid_connections'), [
    'status',
    'archived_at',
    'archive_reason',
    'last_sync_error',
    'status_updated_at',
    'disconnected_at',
    'last_sync_attempt_at',
    'last_repair_success_at',
    'last_sync_at',
  ])
  assert.deepEqual(grantedColumns(migration, 'update', 'plaid_imports'), [
    'imported',
  ])
  assert.deepEqual(grantedColumns(migration, 'insert', 'plaid_connections'), [
    'id',
    'user_id',
    'institution_name',
    'item_id',
    'access_token',
    'created_at',
    'encrypted_access_token',
    'token_iv',
    'token_auth_tag',
    'status',
    'archived_at',
    'archive_reason',
    'last_sync_at',
    'last_sync_error',
    'status_updated_at',
    'disconnected_at',
    'transactions_cursor',
    'household_id',
    'last_sync_attempt_at',
    'last_repair_success_at',
  ])
  assert.deepEqual(grantedColumns(migration, 'insert', 'plaid_imports'), [
    'id',
    'plaid_transaction_id',
    'transaction_date',
    'merchant',
    'amount',
    'plaid_category',
    'suggested_category',
    'imported',
    'created_at',
    'user_id',
    'plaid_account_id',
    'account_name',
    'institution_name',
    'account_type',
    'account_subtype',
    'account_mask',
    'pending',
    'pending_transaction_id',
    'transaction_status',
    'superseded_by_transaction_id',
    'superseded_at',
    'removed_at',
    'updated_at',
    'household_id',
  ])

  for (const column of visualColumns) {
    assert.doesNotMatch(
      migration,
      new RegExp(`grant\\s+(?:insert|update)\\s*\\([\\s\\S]*?\\b${column}\\b[\\s\\S]*?\\)`, 'i')
    )
  }
})

test('Plaid privilege migration preserves service role, RLS, and financial tables', () => {
  const migration = readFileSync(logoPrivilegesMigrationUrl, 'utf8')
  const logoSchemaMigration = readFileSync(logoSchemaMigrationUrl, 'utf8')

  assert.doesNotMatch(migration, /\bservice_role\b/i)
  assert.match(
    logoSchemaMigration,
    /grant select, insert, update on table public\.plaid_institution_assets to service_role/i
  )
  assert.doesNotMatch(migration, /\b(?:create|alter|drop)\s+policy\b/i)
  assert.doesNotMatch(migration, /\b(?:enable|disable|force|no force)\s+row level security\b/i)
  assert.doesNotMatch(
    migration,
    /\b(?:quick_entries|obligations|payments|plaid_accounts|plaid_institution_assets)\b/i
  )
  assert.doesNotMatch(migration, /\b(?:select|delete)\b\s+on\s+table/i)
  assert.doesNotMatch(migration, /\b(?:anon)\b/i)
})

test('authenticated Plaid endpoint writers stay within the column allowlist', () => {
  const connectionWriters = [
    '../app/api/plaid/complete-update/route.ts',
    '../app/api/plaid/sync-accounts/route.ts',
    '../lib/financial-engine/portfolio-management.ts',
    '../lib/plaid/revoke-connection.ts',
    '../lib/plaid-sync/orchestrator.ts',
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
  const importWriters = [
    '../app/api/review-queue/confirm-duplicate/route.ts',
    '../app/api/review-queue/resolve-duplicate/route.ts',
    '../lib/financial-engine/ledger-promotion.ts',
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))

  for (const source of connectionWriters) {
    assert.doesNotMatch(
      source,
      /(?:supabase|userSupabase)\s*\.from\('plaid_connections'\)[\s\S]{0,120}\.update\(\{[^}]*\b(?:institution_id|item_id|access_token|encrypted_access_token|token_iv|token_auth_tag|transactions_cursor|household_id|user_id)\s*:/
    )
  }
  for (const source of importWriters) {
    const updates = source.matchAll(
      /\.from\('plaid_imports'\)[\s\S]{0,120}?\.update\(\{([^}]*)\}\)/g
    )
    for (const update of updates) {
      const columns = [...update[1].matchAll(/\b([a-z_]+)\s*:/g)].map(
        (match) => match[1]
      )
      assert.deepEqual(columns, ['imported'])
    }
  }
})

test('asset endpoints derive URLs from authorized database rows and preserve household isolation', () => {
  const merchant = readFileSync(new URL('../app/api/plaid/assets/merchants/[plaidImportId]/route.ts', import.meta.url), 'utf8')
  const institution = readFileSync(new URL('../app/api/plaid/assets/institutions/[institutionId]/route.ts', import.meta.url), 'utf8')
  assert.match(merchant, /requireApiUser/)
  assert.match(merchant, /\.eq\('id', plaidImportId\)\.eq\('user_id', auth\.user\.id\)/)
  assert.doesNotMatch(merchant, /request\.(json|url)/)
  assert.match(institution, /\.eq\('user_id', auth\.user\.id\)\.eq\('institution_id', institutionId\)/)
})

test('cards keep issuer identity separate from card display identity without retailer logo aliases', () => {
  const types = readFileSync(new URL('../lib/financial-engine/types.ts', import.meta.url), 'utf8')
  const cards = readFileSync(new URL('../app/cards/CardsClient.tsx', import.meta.url), 'utf8')
  const logo = readFileSync(new URL('../app/components/InstitutionLogo.tsx', import.meta.url), 'utf8')

  assert.match(types, /cardDisplayName: string/)
  assert.match(types, /issuerName: string \| null/)
  assert.match(types, /issuerInstitutionId\?: string \| null/)
  assert.match(cards, /card\.issuerInstitutionId \? card\.issuerName : card\.cardDisplayName/)
  assert.doesNotMatch(logo, /BEST BUY|PEP BOYS|Citi \/ Best Buy/)
})

test('UI components always render a local fallback and logos remain presentation-only', () => {
  const institution = readFileSync(new URL('../app/components/InstitutionLogo.tsx', import.meta.url), 'utf8')
  const merchant = readFileSync(new URL('../app/components/MerchantLogo.tsx', import.meta.url), 'utf8')
  const selector = readFileSync(new URL('../lib/plaid/visual-metadata.ts', import.meta.url), 'utf8')
  assert.match(institution, /onError=\{\(\) => \{[\s\S]*?setFailed/)
  assert.match(merchant, /initials\(merchant\)/)
  assert.match(merchant, /bg-slate-800/)
  assert.doesNotMatch(selector, /financial-engine|categor|reconcil|obligation/)
})

test('InstitutionLogo hides initials only after load and restores them on image error', () => {
  const institution = readFileSync(new URL('../app/components/InstitutionLogo.tsx', import.meta.url), 'utf8')
  assert.equal(showLogoInitials(initialLogoLoadState), true)
  assert.equal(showLogoInitials(logoLoadedState()), false)
  assert.equal(showLogoInitials(logoFailedState()), true)
  assert.match(institution, /showLogoInitials\(\{ loaded, failed \}\)/)
  assert.match(institution, /data-institution-initials/)
  assert.match(institution, /onLoad=\{\(\) => \{\s*setFailed\(false\)\s*setLoaded\(true\)/)
  assert.match(institution, /onError=\{\(\) => \{\s*setLoaded\(false\)\s*setFailed\(true\)/)
  assert.match(institution, /bg-\[#f8fafc\]/)
  assert.doesNotMatch(institution, /\{initials\}\s*\{institutionId/)
})

test('Home uses only traceable Plaid identities for institution and merchant logos', () => {
  const home = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
  assert.match(home, /plaid_accounts'[\s\S]*\.select\('plaid_account_id, connection_id'\)/)
  assert.match(home, /institutionIdByPlaidAccountId/)
  assert.match(home, /merchantLogoPlaidImportId: plaidImportId && hasTrustedMerchantLogo/)
  assert.match(home, /<MerchantLogo[\s\S]*plaidImportId=\{movement\.merchantLogoPlaidImportId\}/)
  assert.match(home, /institutionId=\{movement\.institutionId\}/)
  assert.doesNotMatch(home, /institutionId=.*displayInstitution/)
})

test('financial pages degrade safely before the visual schema exists', () => {
  const plaidPage = readFileSync(
    new URL('../app/plaid/page.tsx', import.meta.url),
    'utf8'
  )
  const cardsPage = readFileSync(
    new URL('../app/cards/page.tsx', import.meta.url),
    'utf8'
  )
  const historyPage = readFileSync(
    new URL('../app/history/page.tsx', import.meta.url),
    'utf8'
  )
  const reviewCard = readFileSync(
    new URL('../app/lab/review-queue/ActionableTransactionCard.tsx', import.meta.url),
    'utf8'
  )

  assert.match(
    plaidPage,
    /\.select\(\s*'id, institution_name, created_at,[^']+'\s*\)/
  )
  assert.match(plaidPage, /connectionVisualsResult\.data \|\| \[\]/)
  assert.match(cardsPage, /catch \{\s*connectionVisuals = \[\]/)
  assert.match(
    historyPage,
    /merchantEntityId &&\s*transaction\.metadata\.merchantLogoUrl/
  )
  assert.match(
    reviewCard,
    /metadata\.merchantEntityId &&\s*candidate\.transaction\.metadata\.merchantLogoUrl/
  )
})
