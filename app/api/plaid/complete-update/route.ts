import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/requireApiUser'
import { syncPlaidAccountsForUser } from '@/app/api/plaid/sync-accounts/route'
import { syncPlaidImportsForUser } from '@/app/api/plaid/sync-imports/route'
import { getAuthorizedRepairConnection } from '@/lib/plaid/authorized-connection'
import { PLAID_REPAIR_SYNC_PENDING } from '@/lib/plaid/connection-health'
import { plaidClient } from '@/lib/plaid/client'
import { connectionAccessToken } from '@/lib/plaid/connection-token'
import {
  runWithPlaidBackoff,
  verifyUpdatedPlaidItem,
} from '@/lib/plaid/update-mode-verification'
import { requireMutationOrigin } from '@/lib/security/request-origin'
import { createServerSupabase } from '@/lib/supabase/server'

function connectionIdFrom(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function connectionFailed(
  result: { failed_connections?: Array<{ id?: string }> },
  connectionId: string
) {
  return Boolean(
    result.failed_connections?.some((failure) => failure.id === connectionId)
  )
}

function safeSyncErrorCode(
  result: { failed_connections?: Array<{ id?: string; error_code?: string }> },
  connectionId: string
) {
  return (
    result.failed_connections?.find((failure) => failure.id === connectionId)
      ?.error_code || 'SYNC_FAILED'
  )
}

const processingErrorCodes = new Set([
  'PRODUCT_NOT_READY',
  'INSTITUTION_NOT_RESPONDING',
  'INSTITUTION_DOWN',
  'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',
])

function completionResponse(
  state:
    | 'repair_and_sync_completed'
    | 'repair_completed_processing'
    | 'repair_credentials_required'
    | 'sync_retryable_failure',
  message: string,
  status: number,
  details: Record<string, number> = {}
) {
  return NextResponse.json({ ok: status < 300, state, message, ...details }, { status })
}

export async function POST(request: Request) {
  const originError = requireMutationOrigin(request)
  if (originError) return originError

  const { supabase } = await createServerSupabase()
  const auth = await requireApiUser(supabase)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as {
    connectionId?: unknown
    completionSource?: unknown
  } | null
  const connectionId = connectionIdFrom(body?.connectionId)
  if (!connectionId) {
    return NextResponse.json(
      { error: 'La conexión es requerida' },
      { status: 400 }
    )
  }
  const completionSource =
    body?.completionSource === 'link_on_success'
      ? 'link_on_success'
      : body?.completionSource === 'sync_retry'
        ? 'sync_retry'
        : 'unknown'

  const authorized = await getAuthorizedRepairConnection(
    supabase,
    auth.user,
    connectionId
  )
  if (!authorized.ok) {
    return NextResponse.json(
      { error: authorized.error },
      { status: authorized.status }
    )
  }

  console.info('Plaid Update Mode completion requested', {
    connection_id: connectionId,
    completion_source: completionSource,
  })

  const accessToken = connectionAccessToken(authorized.connection)
  if (!accessToken) {
    return completionResponse(
      'sync_retryable_failure',
      'No pudimos verificar la conexión en este momento. Inténtalo nuevamente.',
      409
    )
  }

  const attemptedAt = new Date().toISOString()
  const { error: attemptError } = await supabase
    .from('plaid_connections')
    .update({ last_sync_attempt_at: attemptedAt })
    .eq('id', connectionId)
    .eq('household_id', authorized.connection.household_id)
    .is('archived_at', null)
  if (attemptError) {
    return completionResponse(
      'sync_retryable_failure',
      'No pudimos iniciar la sincronización. Inténtalo nuevamente.',
      500
    )
  }

  const itemCheck = await verifyUpdatedPlaidItem({
    itemGet: async () => {
      const response = await plaidClient.itemGet({ access_token: accessToken })
      return response.data.item
    },
    onAttempt: (item, attempt) => {
      console.info('Plaid Update Mode item status', {
        connection_id: connectionId,
        attempt,
        error_code: item.errorCode,
        consent_expiration_time: item.consentExpirationTime,
        update_type: item.updateType,
        institution_id: item.institutionId,
        available_products: item.availableProducts,
        billed_products: item.billedProducts,
      })
    },
  })

  if (itemCheck.state === 'credentials_required') {
    return completionResponse(
      'repair_credentials_required',
      'Banco Popular todavía necesita que vuelvas a iniciar sesión. No se cambió el estado de la conexión.',
      409
    )
  }

  if (itemCheck.state === 'item_check_failed') {
    console.warn('Plaid Update Mode item verification failed', {
      connection_id: connectionId,
      attempts: itemCheck.attempts,
      error_code: itemCheck.errorCode,
    })
    return completionResponse(
      processingErrorCodes.has(itemCheck.errorCode)
        ? 'repair_completed_processing'
        : 'sync_retryable_failure',
      processingErrorCodes.has(itemCheck.errorCode)
        ? 'La reparación terminó, pero Plaid todavía está procesando la información. Inténtalo nuevamente en unos minutos.'
        : 'La reparación terminó, pero no pudimos verificar la información. Inténtalo nuevamente.',
      processingErrorCodes.has(itemCheck.errorCode) ? 202 : 502
    )
  }

  const repairVerifiedAt = new Date().toISOString()
  const { error: repairTimestampError } = await supabase
    .from('plaid_connections')
    .update({ last_repair_success_at: repairVerifiedAt })
    .eq('id', connectionId)
    .eq('household_id', authorized.connection.household_id)
    .is('archived_at', null)
  if (repairTimestampError) {
    return completionResponse(
      'sync_retryable_failure',
      'La reparación terminó, pero no pudimos iniciar la sincronización. Inténtalo nuevamente.',
      500
    )
  }

  try {
    const accountAttempt = await runWithPlaidBackoff({
      run: () =>
        syncPlaidAccountsForUser(
          supabase,
          authorized.connection.user_id,
          {
            accounts: true,
            liabilities: false,
            connectionId,
            deferConnectionSuccessMetadata: true,
          }
        ),
      shouldRetry: (result) => connectionFailed(result, connectionId),
    })
    const accounts = accountAttempt.result
    if (connectionFailed(accounts, connectionId)) {
      throw new Error(
        safeSyncErrorCode(accounts, connectionId)
      )
    }

    const transactionAttempt = await runWithPlaidBackoff({
      run: () =>
        syncPlaidImportsForUser(
          authorized.connection.user_id,
          {
            reconcile: true,
            connectionId,
            deferConnectionSuccessMetadata: true,
          }
        ),
      shouldRetry: (result) => connectionFailed(result, connectionId),
    })
    const transactions = transactionAttempt.result
    if (connectionFailed(transactions, connectionId)) {
      throw new Error(
        safeSyncErrorCode(transactions, connectionId)
      )
    }

    console.info('Plaid Update Mode synchronization completed', {
      connection_id: connectionId,
      item_attempts: itemCheck.attempts,
      account_attempts: accountAttempt.attempts,
      transaction_attempts: transactionAttempt.attempts,
    })

    const completedAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('plaid_connections')
      .update({
        status: 'active',
        last_sync_error: null,
        last_sync_at: completedAt,
        status_updated_at: completedAt,
      })
      .eq('id', connectionId)
      .eq('household_id', authorized.connection.household_id)
      .is('archived_at', null)
      .select('id')
      .single()

    if (updateError) throw updateError

    return completionResponse(
      'repair_and_sync_completed',
      'Conexión reparada y sincronizada correctamente.',
      200,
      {
        accounts_updated: accounts.synced_accounts,
        transactions_added_or_updated:
        transactions.new_imports_created +
        transactions.modified_imports_updated,
      }
    )
  } catch (error) {
    const errorCode =
      error instanceof Error && error.message ? error.message : 'SYNC_FAILED'
    const isProcessing = processingErrorCodes.has(errorCode)
    await supabase
      .from('plaid_connections')
      .update({
        last_sync_error: `${PLAID_REPAIR_SYNC_PENDING}: ${errorCode}`,
      })
      .eq('id', connectionId)
      .eq('household_id', authorized.connection.household_id)
      .is('archived_at', null)

    return completionResponse(
      isProcessing
        ? 'repair_completed_processing'
        : 'sync_retryable_failure',
      isProcessing
        ? 'La reparación terminó, pero Plaid todavía está procesando la información. Inténtalo nuevamente en unos minutos.'
        : 'La reparación terminó, pero la sincronización necesita otro intento.',
      isProcessing ? 202 : 502
    )
  }
}
