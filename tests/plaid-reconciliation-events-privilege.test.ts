import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260731005138_plaid_reconciliation_events_service_role_privileges.sql',
    import.meta.url
  ),
  'utf8'
)
const reconciliation = readFileSync(
  new URL(
    '../lib/financial-engine/obligation-reconciliation-engine.ts',
    import.meta.url
  ),
  'utf8'
)

test('reconciliation events grant is limited to SELECT and INSERT for service_role', () => {
  assert.match(
    migration,
    /revoke all privileges\s+on table public\.obligation_reconciliation_events\s+from service_role/i
  )
  assert.match(
    migration,
    /grant\s+select,\s*insert\s+on table public\.obligation_reconciliation_events\s+to service_role/i
  )
  assert.doesNotMatch(
    migration,
    /\bgrant all\b|\bgrant\s+[^;]*(update|delete|truncate|references|trigger)\b/i
  )
})

test('reconciliation privilege migration preserves RLS and policies', () => {
  assert.doesNotMatch(
    migration,
    /\b(enable|disable|force|no force)\s+row level security\b|\b(create|alter|drop)\s+policy\b/i
  )
})

test('worker reads event identity and inserts each event once', () => {
  assert.match(
    reconciliation,
    /\.from\('obligation_reconciliation_events'\)[\s\S]*\.select\('payment_link_id, event_type'\)/
  )
  assert.match(reconciliation, /existingEventKeys\.has\(eventKey\)/)
  assert.match(reconciliation, /insertEventOnce\(linkId, 'payment_detected'/)
  assert.match(reconciliation, /insertEventOnce\(linkId, 'auto_reconciled'/)
})
