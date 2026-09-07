import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const migration = source(
  'supabase/migrations/20260816150605_confirm_review_transaction_imported_only.sql'
)
const privilegeMigration = source(
  'supabase/migrations/20260815195007_plaid_logos_authenticated_write_privileges.sql'
)
const decisionRoute = source('app/api/review-queue/decide-transaction/route.ts')

function normalPromotionBody(sql: string) {
  const ignoreBranch = /if p_transaction_type = 'ignore' then[\s\S]*?return jsonb_build_object\('ignored', true[\s\S]*?end if;/i
  assert.match(sql, ignoreBranch)
  return sql.replace(ignoreBranch, '')
}

test('authenticated keeps the approved imported-only UPDATE contract', () => {
  assert.match(
    privilegeMigration,
    /revoke update on table public\.plaid_imports from authenticated;[\s\S]*grant update \(\s*imported\s*\) on table public\.plaid_imports to authenticated;/i
  )
  assert.doesNotMatch(migration, /\b(grant|revoke)\b/i)
})

test('normal Save transaction writes only plaid_imports.imported', () => {
  const normalPath = normalPromotionBody(migration)
  assert.match(
    normalPath,
    /update public\.plaid_imports\s+set imported = true\s+where id = v_import\.id and user_id = v_user_id;/i
  )
  assert.doesNotMatch(
    normalPath.match(/update public\.plaid_imports[\s\S]*?;/i)?.[0] || '',
    /updated_at|transaction_status/i
  )
})

test('promotion remains one SECURITY INVOKER RPC isolated by auth.uid and user_id', () => {
  assert.match(migration, /language plpgsql\s+security invoker/i)
  assert.match(migration, /v_user_id uuid := \(select auth\.uid\(\)\)/i)
  assert.match(
    migration,
    /where id = p_plaid_import_id and user_id = v_user_id\s+for update;/i
  )
  assert.match(decisionRoute, /supabase\.rpc\('confirm_review_transaction'/)
  assert.doesNotMatch(decisionRoute, /getSupabaseAdmin|service_role/i)
})

test('a failed plaid_import update aborts the same database transaction as quick_entries', () => {
  const quickEntryWrite = migration.indexOf('insert into public.quick_entries')
  const plaidImportWrite = migration.lastIndexOf('update public.plaid_imports')
  assert.ok(quickEntryWrite >= 0 && plaidImportWrite > quickEntryWrite)
  assert.match(migration, /create or replace function public\.confirm_review_transaction/)
  assert.doesNotMatch(migration, /\bcommit\b|\brollback\b|exception\s+when/i)
  assert.equal((decisionRoute.match(/\.rpc\('confirm_review_transaction'/g) || []).length, 1)
})

test('ignore remains unchanged and explicitly outside this correction', () => {
  assert.match(
    migration,
    /if p_transaction_type = 'ignore' then[\s\S]*set imported = true, transaction_status = 'rejected', updated_at = now\(\)/i
  )
  assert.match(migration, /ignore branch is intentionally unchanged/i)
})

test('the correction does not touch ATH context, visual columns, RLS or financial grants', () => {
  assert.doesNotMatch(
    migration,
    /ath_movil|transaction_enrichments|transaction_suggestions|merchant_(entity_id|logo_url|website|confidence|logo_source)|institution_id|create policy|alter policy|enable row level security/i
  )
})
