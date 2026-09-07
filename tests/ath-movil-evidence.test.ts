import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { athContentFingerprint, htmlToSafeText, parseAthEmail, redactAthReference } from '../lib/ath-movil/parser.ts'
import { buildAthMatchCandidates, scoreAthCandidate, shouldCreateAthCandidate } from '../lib/ath-movil/matcher.ts'
import {
  ATH_EVIDENCE_SCHEMA_WARNING,
  resolveOptionalAthEvidenceRows,
} from '../lib/ath-movil/schema-availability.ts'
import { decryptGoogleRefreshToken, encryptGoogleRefreshToken } from '../lib/gmail/token-crypto.ts'
import { extractGmailMimeTextWithAttachments } from '../lib/ath-movil/gmail-mime.ts'
import {
  ATH_EVIDENCE_QUERY_BATCH_SIZE,
  loadAthEvidenceForPlaidImports,
} from '../lib/ath-movil/evidence-loader.ts'
import type { FinancialSupabaseClient } from '../lib/financial-engine/types.ts'

const sentFixture = {
  subject: 'You paid $42.00 to redacted recipient',
  plainText: 'Sent to: María Demo Date: 2026-07-28T15:42:00-04:00 Message: Almuerzo Reference: ATH-ABC1842 Phone: (***) ***-1842 From card: Popular ••••1234',
  htmlText: null,
  snippet: null,
  emailReceivedAt: '2026-07-28T19:43:00Z',
}

test('parser extracts normalized ATH evidence without assigning a financial category', () => {
  const parsed = parseAthEmail(sentFixture)
  assert.equal(parsed.occurredAt, '2026-07-28T19:42:00.000Z')
  assert.equal(parsed.direction, 'sent')
  assert.equal(parsed.counterpartyPhoneLast4, '1842')
  assert.equal(parsed.reference, 'ATH-ABC1842')
  assert.equal(parsed.message, 'Almuerzo')
  assert.equal(parsed.parseStatus, 'parsed')
  assert.equal('category' in parsed, false)
})

test('partial and failed messages are preserved as parser results', () => {
  assert.equal(parseAthEmail({ ...sentFixture, subject: 'ATH receipt $42.00', plainText: null }).parseStatus, 'partial')
  assert.equal(parseAthEmail({ ...sentFixture, subject: null, plainText: null, snippet: null, emailReceivedAt: '' }).parseStatus, 'failed')
})

test('HTML is converted to text and script content is never exposed', () => {
  const text = htmlToSafeText('<p>Sent to: Demo</p><script>token=secret</script>')
  assert.equal(text?.includes('<'), false)
  assert.equal(text?.includes('token=secret'), false)
})

test('fingerprints are deterministic and use more than amount and date', () => {
  const parsed = parseAthEmail(sentFixture)
  assert.equal(athContentFingerprint('household-a', parsed), athContentFingerprint('household-a', parsed))
  assert.notEqual(athContentFingerprint('household-a', parsed), athContentFingerprint('household-b', parsed))
})

const email = { ...parseAthEmail(sentFixture), id: 'email-a', householdId: 'household-a' }
const plaid = (overrides = {}) => ({
  id: 'plaid-a', householdId: 'household-a', amountCents: 4200,
  signedAmountCents: 4200,
  transactionDate: '2026-07-28', merchant: 'Maria Demo', accountName: 'Popular 1234', accountMask: '1234',
  pending: false, transactionStatus: 'active', removedAt: null, supersededAt: null, ...overrides,
})

test('amount mismatch can never produce a strong match', () => {
  const mismatchEmail = { ...email, amountCents: 4100 }
  const result = scoreAthCandidate(mismatchEmail, plaid())
  assert.ok(result)
  assert.ok(result.score < 70)
})

test('name cannot compensate for amount mismatch and cross-household is rejected', () => {
  assert.ok((scoreAthCandidate({ ...email, amountCents: 1 }, plaid())?.score || 0) < 70)
  assert.equal(scoreAthCandidate(email, plaid({ householdId: 'household-b' })), null)
})

test('real notification labels parse received counterparty and labeled date safely', () => {
  const parsed = parseAthEmail({
    subject: 'You received $100.00',
    plainText: 'From: Persona A Date: July 28, 2026 at 3:42 PM Amount: $100.00 Message: Reembolso (***) ***-1234',
    htmlText: null,
    snippet: null,
    emailReceivedAt: '2026-07-28T19:43:00Z',
  })
  assert.equal(parsed.direction, 'received')
  assert.equal(parsed.counterpartyName, 'Persona A')
  assert.equal(parsed.fields.occurredAt.pattern, 'labeled_date')
  assert.equal(parsed.parseStatus, 'parsed')
})

for (const [subject, direction] of [
  ['Transfer receipt:$25.00 to Persona A', 'sent'],
  ['Transfer receipt: $50.00 from Persona B', 'received'],
  ['Payment Receipt: Persona A', 'sent'],
  ['You paid $7.00 to Persona B', 'sent'],
  ['You transferred between cards', 'internal_transfer'],
] as const) {
  test(`real ATH subject format derives ${direction}: ${subject.split(':')[0]}`, () => {
    const parsed = parseAthEmail({
      subject,
      plainText: 'Date: July 28, 2026 at 3:42 PM Amount: $25.00 Message: Fixture',
      htmlText: null,
      snippet: null,
      emailReceivedAt: '2026-07-28T19:43:00Z',
    })
    assert.equal(parsed.direction, direction)
    assert.equal(parsed.financialEvidence, true)
  })
}

test('security login alerts are explicitly non-financial and ignored by matching', () => {
  const parsed = parseAthEmail({
    subject: 'SECURITY ALERT: Recent Login in ATH Móvil',
    plainText: 'A recent login was detected.',
    htmlText: null,
    snippet: null,
    emailReceivedAt: '2026-07-28T19:43:00Z',
  })
  assert.equal(parsed.financialEvidence, false)
  assert.equal(parsed.ignoreReason, 'security_alert')
  assert.equal(parsed.parseStatus, 'failed')
  assert.equal(buildAthMatchCandidates({ ...parsed, id: 'alert', householdId: 'household-a' }, [plaid()]).length, 0)
})

test('MIME attachment parts are decoded when Gmail omits inline body data', async () => {
  const encoded = Buffer.from('You paid $7.00 to Persona A').toString('base64url')
  const mime = await extractGmailMimeTextWithAttachments(
    { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/plain', body: { attachmentId: 'attachment-a' } }] },
    async (attachmentId) => attachmentId === 'attachment-a' ? encoded : null
  )
  assert.equal(mime.plainText, 'You paid $7.00 to Persona A')
})

test('ATH direction must match the signed Plaid impact', () => {
  const received = { ...email, direction: 'received' as const }
  assert.equal(buildAthMatchCandidates(received, [plaid({ signedAmountCents: 4200 })]).length, 0)
  assert.equal(buildAthMatchCandidates(received, [plaid({ signedAmountCents: -4200 })]).length, 1)
  assert.equal(buildAthMatchCandidates(email, [plaid({ signedAmountCents: -4200 })]).length, 0)
})

test('amount mismatch is not emitted as a review candidate', () => {
  assert.equal(buildAthMatchCandidates({ ...email, amountCents: 4100 }, [plaid()]).length, 0)
})

test('candidate alternatives are deterministic and ties are ambiguous', () => {
  const first = buildAthMatchCandidates(email, [plaid({ id: 'b' }), plaid({ id: 'a' }), plaid({ id: 'c', amountCents: 9999 })])
  const second = buildAthMatchCandidates(email, [plaid({ id: 'a' }), plaid({ id: 'b' }), plaid({ id: 'c', amountCents: 9999 })])
  assert.deepEqual(first.map((item) => item.plaidImportId), second.map((item) => item.plaidImportId))
  assert.equal(first[0].ambiguous, true)
  assert.ok(first.length <= 3)
})

test('reviewed candidate pairs never reappear during recalculation', () => {
  assert.equal(shouldCreateAthCandidate(undefined), true)
  assert.equal(shouldCreateAthCandidate('suggested'), false)
  assert.equal(shouldCreateAthCandidate('confirmed'), false)
  assert.equal(shouldCreateAthCandidate('rejected'), false)
  assert.equal(shouldCreateAthCandidate('superseded'), false)
})

test('phones and references are redacted for display', () => {
  assert.equal(redactAthReference('ATH-ABC1842'), '••••1842')
})

test('Gmail refresh tokens round-trip through an authenticated encrypted envelope', () => {
  const encrypted = encryptGoogleRefreshToken('refresh-token-fixture', 'test-root-secret')
  assert.notEqual(encrypted.encryptedRefreshToken, 'refresh-token-fixture')
  assert.equal(decryptGoogleRefreshToken(encrypted.encryptedRefreshToken, encrypted.tokenIv, encrypted.tokenAuthTag, 'test-root-secret'), 'refresh-token-fixture')
  assert.throws(() => decryptGoogleRefreshToken(encrypted.encryptedRefreshToken, encrypted.tokenIv, encrypted.tokenAuthTag, 'wrong-secret'))
})

test('migration and routes preserve Plaid as the only ledger source', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260729031323_ath_movil_evidence_candidates.sql', import.meta.url), 'utf8')
  const importer = readFileSync(new URL('../app/api/gmail/ath-import/route.ts', import.meta.url), 'utf8')
  const decision = readFileSync(new URL('../app/api/ath-movil/candidates/[id]/decision/route.ts', import.meta.url), 'utf8')
  const detail = readFileSync(new URL('../app/api/transactions/ath-evidence/route.ts', import.meta.url), 'utf8')
  const oauthCallback = readFileSync(new URL('../app/api/auth/google/callback/route.ts', import.meta.url), 'utf8')
  const tokenStore = readFileSync(new URL('../lib/gmail/token-store.ts', import.meta.url), 'utf8')
  const historyPanel = readFileSync(new URL('../app/history/AthEvidencePanel.tsx', import.meta.url), 'utf8')
  const reprocess = readFileSync(new URL('../app/api/gmail/ath-reprocess/route.ts', import.meta.url), 'utf8')
  assert.match(migration, /ath_movil_match_candidates/i)
  assert.match(migration, /unique \(ath_email_id, plaid_import_id\)/i)
  assert.match(migration, /private\.is_household_member/i)
  assert.doesNotMatch(migration, /create policy ath_match_candidates_household_(insert|update)/i)
  assert.match(migration, /revoke insert, update, delete on public\.ath_movil_emails from authenticated/i)
  assert.match(migration, /revoke all on public\.ath_movil_match_candidates from authenticated/i)
  assert.match(migration, /foreign key \(gmail_connection_id, household_id\)/i)
  assert.doesNotMatch(migration, /create policy ath_match_candidates_household_delete/i)
  assert.match(migration, /score integer not null check \(score between 0 and 100\)/i)
  assert.match(migration, /status in \('suggested', 'confirmed', 'rejected', 'superseded', 'stale'\)/i)
  assert.match(migration, /counterparty_phone_last4 is null or counterparty_phone_last4 ~ '\^\[0-9\]\{4\}\$'/i)
  assert.match(migration, /grant select, insert, update on public\.ath_movil_match_candidates to service_role/i)
  assert.match(migration, /ath_match_candidates_one_confirmed_email_idx/i)
  assert.match(migration, /ath_match_candidates_one_confirmed_plaid_idx/i)
  assert.match(migration, /encrypted_refresh_token text/i)
  assert.doesNotMatch(migration, /grant select on public\.gmail_evidence_sync_state to authenticated/i)
  assert.doesNotMatch(migration, /create policy gmail_evidence_sync_state_household_select/i)
  assert.doesNotMatch(migration, /grant[^;]*delete[^;]*ath_movil/i)
  assert.match(migration, /revoke all on function public\.decide_ath_movil_candidate[\s\S]*from public, anon, authenticated/i)
  assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i)
  for (const source of [importer, decision, reprocess]) {
    assert.doesNotMatch(source, /\.from\(['"]quick_entries['"]\)[\s\S]{0,300}\.(insert|update|delete|upsert)/)
    assert.doesNotMatch(source, /\.from\(['"]plaid_imports['"]\)[\s\S]{0,300}\.(insert|update|delete|upsert)/)
  }
  assert.match(importer, /format=full/)
  assert.match(importer, /attachments\/\$\{attachmentId\}/)
  assert.match(importer, /from:info@notifications\.evertecinc\.com/)
  assert.match(importer, /requireHouseholdGmailManager/)
  assert.match(decision, /reviewed_by/)
  assert.match(decision, /decide_ath_movil_candidate/)
  assert.match(decision, /requireApiUser/)
  assert.match(decision, /household_members/)
  assert.match(detail, /requireApiUser/)
  assert.match(detail, /household_members/)
  assert.match(detail, /\.eq\('household_id', membership\.household_id\)/)
  assert.doesNotMatch(decision, /body\.(household_id|householdId|reviewed_by|reviewedBy|user_id|userId)/)
  assert.doesNotMatch(decision, /\.delete\(/)
  assert.match(oauthCallback, /storeHouseholdGoogleRefreshToken/)
  const tokenCrypto = readFileSync(new URL('../lib/gmail/token-crypto.ts', import.meta.url), 'utf8')
  assert.match(tokenCrypto, /aes-256-gcm/)
  assert.match(tokenStore, /getSupabaseAdmin/)
  assert.doesNotMatch(tokenStore, /NextResponse|use client/)
  assert.match(historyPanel, /Confirmar relación/)
  assert.match(historyPanel, /No corresponde/)
  assert.match(reprocess, /\.neq\('parse_status', 'parsed'\)/)
  assert.match(reprocess, /is_ignored: !parsed\.financialEvidence/)
})

test('ATH page contains no email-derived spending total', () => {
  const page = readFileSync(new URL('../app/ath-movil/page.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(page, /Total ATH gastos|totalSpending|categoryTotals/)
  assert.match(page, /no afectan los totales/i)
  assert.match(page, /AthGmailActions/)
  assert.match(page, /count: 'exact'/)
  assert.match(page, /Notificación no financiera · ignorada/)
})

test('ATH privilege hardening grants only the operations used by the evidence flow', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260802232850_ath_movil_minimum_privileges.sql', import.meta.url),
    'utf8'
  )
  assert.match(migration, /revoke all on table public\.ath_movil_emails from authenticated/i)
  assert.match(migration, /grant select on table public\.ath_movil_emails to authenticated/i)
  for (const table of ['ath_movil_emails', 'ath_movil_match_candidates', 'gmail_evidence_sync_state']) {
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from service_role`, 'i'))
    assert.match(migration, new RegExp(`grant select, insert, update on table public\\.${table} to service_role`, 'i'))
  }
  assert.doesNotMatch(migration, /grant all/i)
  assert.doesNotMatch(migration, /grant\s+(?:delete|truncate|references|trigger)/i)
  assert.doesNotMatch(migration, /(?:enable|disable) row level security|create policy|drop policy/i)
})

test('ATH evidence foreign keys have covering indexes without schema behavior changes', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260802233136_ath_movil_evidence_foreign_key_indexes.sql', import.meta.url),
    'utf8'
  )
  assert.match(migration, /ath_movil_emails\(gmail_connection_id, household_id\)/i)
  assert.match(migration, /ath_movil_match_candidates\(ath_email_id, household_id\)/i)
  assert.match(migration, /ath_movil_match_candidates\(plaid_import_id, household_id\)/i)
  assert.match(migration, /ath_movil_match_candidates\(reviewed_by\)/i)
  assert.doesNotMatch(migration, /insert|update|delete|alter table|policy|grant|revoke/i)
})

for (const schemaError of [
  {
    code: 'PGRST205',
    message:
      "Could not find the table 'public.ath_movil_match_candidates' in the schema cache",
    resource: 'ath_movil_match_candidates' as const,
  },
  {
    code: '42P01',
    message: 'relation "public.ath_movil_match_candidates" does not exist',
    resource: 'ath_movil_match_candidates' as const,
  },
  {
    code: '42703',
    message: 'column ath_movil_emails.occurred_at does not exist',
    resource: 'ath_movil_emails' as const,
  },
]) {
  test(`${schemaError.code} from optional ATH evidence returns no evidence`, () => {
    const warnings: unknown[][] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => warnings.push(args)
    try {
      const result = resolveOptionalAthEvidenceRows(
        { data: null, error: schemaError },
        schemaError.resource
      )
      assert.deepEqual(result, { rows: [], schemaAvailable: false })
      assert.deepEqual(warnings, [[ATH_EVIDENCE_SCHEMA_WARNING]])
    } finally {
      console.warn = originalWarn
    }
  })
}

test('permission and unrelated missing-column errors are not hidden', () => {
  const permissionError = { code: '42501', message: 'permission denied' }
  assert.throws(
    () => resolveOptionalAthEvidenceRows(
      { data: null, error: permissionError },
      'ath_movil_match_candidates'
    ),
    (error) => error === permissionError
  )

  const unrelatedColumnError = {
    code: '42703',
    message: 'column quick_entries.amount does not exist',
  }
  assert.throws(
    () => resolveOptionalAthEvidenceRows(
      { data: null, error: unrelatedColumnError },
      'ath_movil_emails'
    ),
    (error) => error === unrelatedColumnError
  )
})

test('Home and Review Queue use the bounded ATH fallback without changing totals', () => {
  const home = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
  const reviewQueue = readFileSync(
    new URL('../lib/financial-engine/review-queue.ts', import.meta.url),
    'utf8'
  )
  const evidenceLoader = readFileSync(
    new URL('../lib/ath-movil/evidence-loader.ts', import.meta.url),
    'utf8'
  )
  const detail = readFileSync(
    new URL('../app/api/transactions/ath-evidence/route.ts', import.meta.url),
    'utf8'
  )

  assert.match(home, /getReviewQueue\(supabase, user\.id\)/)
  assert.match(reviewQueue, /loadAthEvidenceForPlaidImports/)
  assert.match(evidenceLoader, /resolveOptionalAthEvidenceRows/)
  assert.match(evidenceLoader, /'ath_movil_match_candidates'/)
  assert.match(detail, /if \(importError\)/)
  assert.match(detail, /No se pudo cargar la transacción importada/)

  for (const financialSource of [
    '../lib/financial-engine/ledger-summary.ts',
    '../lib/financial-engine/liquidity.ts',
    '../lib/financial-engine/income.ts',
  ]) {
    const source = readFileSync(new URL(financialSource, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /ath_movil_(emails|match_candidates)/)
  }
})

test('Review Queue bounds Supabase filters for 500+ ATH evidence records', async () => {
  const recordCount = 600
  const plaidImportIds = Array.from(
    { length: recordCount },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
  )
  const matches = plaidImportIds.map((plaidImportId, index) => ({
    id: `match-${index}`,
    ath_email_id: `email-${index}`,
    plaid_import_id: plaidImportId,
    score: 90,
    rank: 1,
    status: 'suggested',
    reasons: [],
  }))
  const emails = plaidImportIds.map((_, index) => ({
    id: `email-${index}`,
    occurred_at: '2026-08-01T12:00:00Z',
    direction: 'sent',
    counterparty_name: `Recipient ${index}`,
    counterparty_phone_last4: null,
    message: null,
    reference: null,
  }))
  const filters: Array<{ table: string; column: string; values: string[] }> = []

  const supabase = {
    from(table: string) {
      const queryFilters: Array<{ column: string; values: string[] }> = []
      const execute = () => {
        const idFilter = queryFilters.find(({ column }) =>
          column === 'plaid_import_id' || column === 'id'
        )
        const ids = new Set(idFilter?.values || [])
        return {
          data: table === 'ath_movil_match_candidates'
            ? matches.filter((row) => ids.has(row.plaid_import_id))
            : emails.filter((row) => ids.has(row.id)),
          error: null,
        }
      }
      const builder = {
        select() { return builder },
        in(column: string, values: string[]) {
          queryFilters.push({ column, values })
          filters.push({ table, column, values })
          return builder
        },
        order() { return Promise.resolve(execute()) },
        then(resolve: (value: ReturnType<typeof execute>) => unknown) {
          return Promise.resolve(execute()).then(resolve)
        },
      }
      return builder
    },
  } as unknown as FinancialSupabaseClient

  const result = await loadAthEvidenceForPlaidImports(supabase, plaidImportIds)

  assert.equal(result.athMatches.length, recordCount)
  assert.equal(result.athEmails.length, recordCount)
  const evidenceIdFilters = filters.filter(({ column }) =>
    column === 'plaid_import_id' || column === 'id'
  )
  assert.equal(evidenceIdFilters.length, 12)
  assert.ok(evidenceIdFilters.every(({ values }) =>
    values.length <= ATH_EVIDENCE_QUERY_BATCH_SIZE
  ))

  const unboundedFilter = new URLSearchParams({
    plaid_import_id: `in.(${plaidImportIds.join(',')})`,
  }).toString()
  assert.ok(unboundedFilter.length > 22_000)
  assert.ok(evidenceIdFilters.every(({ column, values }) =>
    new URLSearchParams({ [column]: `in.(${values.join(',')})` }).toString().length < 4_000
  ))
})
