import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  canRepairPlaidConnection,
  plaidConnectionNeedsRepair,
  plaidRepairMessage,
  plaidRepairableState,
} from '../lib/plaid/connection-health.ts'
import {
  UPDATE_MODE_ITEM_RETRY_DELAYS_MS,
  runWithPlaidBackoff,
  verifyUpdatedPlaidItem,
} from '../lib/plaid/update-mode-verification.ts'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('repair eligibility covers only Plaid reauthentication states', () => {
  assert.equal(
    plaidRepairableState('active', 'ITEM_LOGIN_REQUIRED: credentials changed'),
    'ITEM_LOGIN_REQUIRED'
  )
  assert.equal(
    plaidRepairableState('PENDING_DISCONNECT', null),
    'PENDING_DISCONNECT'
  )
  assert.equal(
    plaidRepairableState('active', 'PENDING_EXPIRATION'),
    'PENDING_EXPIRATION'
  )
  assert.equal(plaidConnectionNeedsRepair('active', null), false)
  assert.equal(
    plaidRepairMessage('Banco Popular Puerto Rico'),
    'Banco Popular necesita que vuelvas a iniciar sesión porque las credenciales cambiaron.'
  )
})

test('update Link token uses only the authorized existing Item access token', () => {
  const route = source('app/api/plaid/update-link-token/route.ts')

  assert.match(route, /requireMutationOrigin/)
  assert.match(route, /requireApiUser/)
  assert.match(route, /getAuthorizedRepairConnection/)
  assert.match(route, /connectionAccessToken\(authorized\.connection\)/)
  assert.match(route, /linkTokenCreate/)
  assert.match(route, /access_token:\s*accessToken/)
  assert.doesNotMatch(route, /itemPublicTokenExchange/)
  assert.doesNotMatch(route, /public_token/)
  assert.doesNotMatch(route, /products:/)
  assert.match(route, /NextResponse\.json\(\{ link_token:/)
})

test('connection repair authorization is household-scoped and denies outsiders', () => {
  const authorization = source('lib/plaid/authorized-connection.ts')

  assert.match(authorization, /\.eq\('id', connectionId\)/)
  assert.match(authorization, /\.eq\('auth_user_id', user\.id\)/)
  assert.match(
    authorization,
    /\.eq\('household_id', connection\.household_id\)/
  )
  assert.match(authorization, /\.eq\('active', true\)/)
  assert.match(authorization, /\.in\('role', \['owner', 'member'\]\)/)
  assert.match(authorization, /status:\s*403/)
  assert.match(authorization, /connection\.archived_at/)
  assert.match(authorization, /connection\.status === 'archived'/)

  const route = source('app/api/plaid/update-link-token/route.ts')
  assert.doesNotMatch(route, /body\?\.(userId|user_id|householdId|household_id)/)
  assert.doesNotMatch(route, /body\?\.(accessToken|access_token)/)
})

test('another user or household cannot repair the connection', () => {
  const membership = {
    auth_user_id: 'user-a',
    household_id: 'household-a',
    role: 'owner',
    active: true,
  }

  assert.equal(
    canRepairPlaidConnection({
      authUserId: 'user-a',
      connectionHouseholdId: 'household-a',
      membership,
    }),
    true
  )
  assert.equal(
    canRepairPlaidConnection({
      authUserId: 'user-b',
      connectionHouseholdId: 'household-a',
      membership,
    }),
    false
  )
  assert.equal(
    canRepairPlaidConnection({
      authUserId: 'user-a',
      connectionHouseholdId: 'household-b',
      membership,
    }),
    false
  )
  assert.equal(
    canRepairPlaidConnection({
      authUserId: 'user-a',
      connectionHouseholdId: 'household-a',
      membership: { ...membership, role: 'viewer' },
    }),
    false
  )
})

test('completion preserves the Item and marks success only after both syncs', () => {
  const route = source('app/api/plaid/complete-update/route.ts')
  const accountSync = route.indexOf('syncPlaidAccountsForUser')
  const transactionSync = route.indexOf('syncPlaidImportsForUser')
  const successUpdate = route.indexOf(".update({\n        status: 'active'")

  assert.ok(accountSync >= 0)
  assert.ok(transactionSync > accountSync)
  assert.ok(successUpdate > transactionSync)
  assert.match(route, /connectionId,/)
  assert.match(route, /deferConnectionSuccessMetadata:\s*true/)
  assert.match(route, /plaidClient\.itemGet/)
  assert.match(route, /verifyUpdatedPlaidItem/)
  assert.match(route, /last_sync_attempt_at:\s*attemptedAt/)
  assert.match(route, /last_repair_success_at:\s*repairVerifiedAt/)
  assert.match(route, /last_sync_error:\s*null/)
  assert.match(route, /last_sync_at:\s*completedAt/)
  assert.match(route, /\.is\('archived_at', null\)/)
  assert.doesNotMatch(route, /\.insert\(/)
  assert.doesNotMatch(route, /\.delete\(/)
  assert.doesNotMatch(route, /itemPublicTokenExchange|exchange-public-token/)
  assert.doesNotMatch(route, /archived_at:\s*completedAt/)
})

test('Update Mode tolerates a temporarily stale login-required Item', async () => {
  const seenDelays: number[] = []
  const results = [
    { error: { error_code: 'ITEM_LOGIN_REQUIRED' } },
    { error: { error_code: 'ITEM_LOGIN_REQUIRED' } },
    {
      error: null,
      consent_expiration_time: '2027-07-25T00:00:00Z',
      update_type: 'background',
      institution_id: 'ins-popular',
      available_products: ['balance', 'transactions'],
      billed_products: ['transactions'],
    },
  ]

  const result = await verifyUpdatedPlaidItem({
    itemGet: async () => results.shift()!,
    sleep: async (delay) => {
      seenDelays.push(delay)
    },
  })

  assert.equal(result.state, 'healthy')
  assert.equal(result.attempts, 3)
  assert.deepEqual(seenDelays, [1_000, 3_000])
  assert.deepEqual(UPDATE_MODE_ITEM_RETRY_DELAYS_MS, [0, 1_000, 3_000])
})

test('Update Mode preserves an Item that remains login-required', async () => {
  const result = await verifyUpdatedPlaidItem({
    itemGet: async () => ({
      error: { error_code: 'ITEM_LOGIN_REQUIRED' },
    }),
    sleep: async () => undefined,
  })

  assert.equal(result.state, 'credentials_required')
  assert.equal(result.attempts, 3)

  const route = source('app/api/plaid/complete-update/route.ts')
  const credentialsBranch = route.slice(
    route.indexOf("itemCheck.state === 'credentials_required'"),
    route.indexOf("itemCheck.state === 'item_check_failed'")
  )
  assert.doesNotMatch(credentialsBranch, /last_sync_error:\s*null/)
  assert.doesNotMatch(credentialsBranch, /last_sync_at/)
  assert.match(credentialsBranch, /repair_credentials_required/)
})

test('thrown ITEM_LOGIN_REQUIRED responses are retried and remain unhealthy', async () => {
  let calls = 0
  const result = await verifyUpdatedPlaidItem({
    itemGet: async () => {
      calls += 1
      throw {
        response: { data: { error_code: 'ITEM_LOGIN_REQUIRED' } },
      }
    },
    sleep: async () => undefined,
  })

  assert.equal(result.state, 'credentials_required')
  assert.equal(calls, 3)
})

test('healthy Item sync retries are bounded and stop after success', async () => {
  let calls = 0
  const delays: number[] = []
  const result = await runWithPlaidBackoff({
    run: async () => ({ failed: ++calls < 3 }),
    shouldRetry: (value) => value.failed,
    sleep: async (delay) => {
      delays.push(delay)
    },
  })

  assert.equal(result.attempts, 3)
  assert.equal(result.result.failed, false)
  assert.deepEqual(delays, [1_000, 3_000])
})

test('sync retry stops at the bounded maximum', async () => {
  let calls = 0
  const result = await runWithPlaidBackoff({
    run: async () => {
      calls += 1
      return { failed: true }
    },
    shouldRetry: (value) => value.failed,
    sleep: async () => undefined,
  })

  assert.equal(result.attempts, 3)
  assert.equal(calls, 3)
  assert.equal(result.result.failed, true)
})

test('the active UI launches repair separately from new Item creation', () => {
  const page = source('app/plaid/page.tsx')
  const repair = source('app/plaid/RepairPlaidConnectionButton.tsx')

  assert.match(page, /plaidConnectionNeedsRepair/)
  assert.match(page, /!archived/)
  assert.match(page, /<RepairPlaidConnectionButton/)
  assert.match(page, /successfulSync = connection\.last_sync_at/)
  assert.match(repair, /'Reparar conexión'/)
  assert.match(repair, /\/api\/plaid\/update-link-token/)
  assert.match(repair, /\/api\/plaid\/complete-update/)
  assert.match(repair, /onSuccess:\s*async \(\) =>/)
  assert.match(repair, /completeRepair\('link_on_success'\)/)
  assert.match(repair, /completeRepair\('sync_retry'\)/)
  assert.doesNotMatch(repair, /exchange-public-token|public_token|access_token/)
  assert.match(repair, /router\.refresh\(\)/)
  assert.match(repair, /syncPending/)
  assert.match(repair, /'Reintentar sincronización'/)
  assert.match(page, /last_sync_attempt_at/)
  assert.match(page, /last_repair_success_at/)
})

test('targeted repair sync remains source-ID idempotent and does not touch archived duplicates', () => {
  const accounts = source('app/api/plaid/sync-accounts/route.ts')
  const transactions = source('app/api/plaid/sync-imports/route.ts')

  for (const file of [accounts, transactions]) {
    assert.match(file, /options\.connectionId/)
    assert.match(file, /\.eq\('id', options\.connectionId\)/)
    assert.match(file, /\.is\('archived_at', null\)/)
    assert.match(file, /deferConnectionSuccessMetadata/)
  }

  assert.match(transactions, /onConflict:\s*'plaid_transaction_id'/)
  assert.match(transactions, /transactions_cursor/)
  assert.doesNotMatch(
    transactions.slice(
      transactions.indexOf('deferConnectionSuccessMetadata'),
      transactions.indexOf('export async function POST')
    ),
    /itemPublicTokenExchange/
  )
})

test('failed completion keeps sync success unchanged and repair visible', () => {
  const route = source('app/api/plaid/complete-update/route.ts')
  const failureBranch = route.slice(route.lastIndexOf('} catch (error)'))
  const health = source('lib/plaid/connection-health.ts')
  const page = source('app/plaid/page.tsx')

  assert.match(failureBranch, /REPAIR_SYNC_PENDING/)
  assert.doesNotMatch(failureBranch, /last_sync_at/)
  assert.match(health, /signal\.includes\(PLAID_REPAIR_SYNC_PENDING\)/)
  assert.match(page, /needsRepair &&/)
  assert.match(page, /<RepairPlaidConnectionButton/)
})

test('repair timestamp migration is additive and does not rewrite history', () => {
  const migration = source(
    'supabase/migrations/20260725033424_plaid_connection_repair_timestamps.sql'
  )
  assert.match(migration, /last_sync_attempt_at timestamptz/)
  assert.match(migration, /last_repair_success_at timestamptz/)
  assert.doesNotMatch(migration, /\bnot null\b/i)
  assert.doesNotMatch(migration, /\bdefault\b/i)
  assert.doesNotMatch(migration, /\bnow\s*\(/i)
  assert.doesNotMatch(migration, /^\s*(update|delete|insert)\s/im)
  assert.doesNotMatch(
    migration,
    /\b(policy|enable row level security|disable row level security)\b/i
  )
})

test('REPAIR_SYNC_PENDING is local state and is never sent to Plaid', () => {
  const health = source('lib/plaid/connection-health.ts')
  const completion = source('app/api/plaid/complete-update/route.ts')
  const linkToken = source('app/api/plaid/update-link-token/route.ts')

  assert.match(health, /PLAID_REPAIR_SYNC_PENDING = 'REPAIR_SYNC_PENDING'/)
  assert.doesNotMatch(linkToken, /REPAIR_SYNC_PENDING/)
  assert.match(
    completion,
    /plaidClient\.itemGet\(\{\s*access_token:\s*accessToken\s*\}\)/
  )
  assert.doesNotMatch(
    completion.match(/plaidClient\.itemGet\(([\s\S]*?)\)/)?.[1] || '',
    /PLAID_REPAIR_SYNC_PENDING|REPAIR_SYNC_PENDING/
  )
  assert.match(
    completion,
    /last_sync_error:\s*`\$\{PLAID_REPAIR_SYNC_PENDING\}: \$\{errorCode\}`/
  )
})

test('healthy item verification replaces stale credential error with sync-pending state', () => {
  const route = source('app/api/plaid/complete-update/route.ts')
  const healthyFlow = route.slice(
    route.indexOf('const repairVerifiedAt'),
    route.indexOf('return completionResponse(', route.lastIndexOf('} catch (error)'))
  )
  const failureBranch = route.slice(route.lastIndexOf('} catch (error)'))

  assert.match(healthyFlow, /last_repair_success_at:\s*repairVerifiedAt/)
  assert.match(failureBranch, /last_sync_error:\s*`\$\{PLAID_REPAIR_SYNC_PENDING\}/)
  assert.doesNotMatch(failureBranch, /ITEM_LOGIN_REQUIRED/)
  assert.doesNotMatch(failureBranch, /last_sync_at/)
})

test('repair success with pending sync renders retry without reopening Link', () => {
  const page = source('app/plaid/page.tsx')
  const repair = source('app/plaid/RepairPlaidConnectionButton.tsx')
  const pendingBranch = repair.slice(
    repair.indexOf('if (syncPending)'),
    repair.indexOf('try {', repair.indexOf('if (syncPending)'))
  )

  assert.match(page, /includes\(PLAID_REPAIR_SYNC_PENDING\)/)
  assert.match(page, /syncPending=\{repairSyncPending\}/)
  assert.match(pendingBranch, /completeRepair\('sync_retry'\)/)
  assert.doesNotMatch(pendingBranch, /update-link-token|setLaunchWhenReady/)
  assert.match(repair, /syncPending\s*\?\s*'Reintentar sincronización'/)
})

test('successful retry clears sync-pending state and reports healthy timestamps', () => {
  const route = source('app/api/plaid/complete-update/route.ts')
  const page = source('app/plaid/page.tsx')
  const successBranch = route.slice(
    route.indexOf("status: 'active'"),
    route.indexOf("return completionResponse(\n      'repair_and_sync_completed'")
  )

  assert.match(successBranch, /last_sync_error:\s*null/)
  assert.match(successBranch, /last_sync_at:\s*completedAt/)
  assert.match(page, /Último sync exitoso/)
  assert.match(page, /formatDate\(successfulSync\)/)
  assert.match(page, /Último intento de sync/)
  assert.match(page, /formatDate\(connection\.last_sync_attempt_at\)/)
  assert.match(page, /Última reparación verificada/)
  assert.match(page, /formatDate\(connection\.last_repair_success_at\)/)
})

test('archived connections cannot enter repair or retry UI flows', () => {
  const page = source('app/plaid/page.tsx')
  const route = source('app/api/plaid/complete-update/route.ts')
  const authorization = source('lib/plaid/authorized-connection.ts')

  assert.match(page, /!archived &&[\s\S]*plaidConnectionNeedsRepair/)
  assert.match(page, /\{needsRepair && \(/)
  assert.match(authorization, /connection\.archived_at/)
  assert.match(authorization, /connection\.status === 'archived'/)
  assert.match(route, /\.is\('archived_at', null\)/)
})
