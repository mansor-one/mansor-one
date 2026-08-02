import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { syncPlaidAccountsForUser } from '@/app/api/plaid/sync-accounts/route'
import { syncPlaidImportsForUser } from '@/app/api/plaid/sync-imports/route'
import { reconcileOpenObligationsAfterPlaidSync } from '@/lib/financial-engine/obligation-reconciliation-engine'
import { getFinancialEngineSnapshot } from '@/lib/financial-engine/snapshot'
import { serializePlaidSyncError } from './error-serialization'
import { summaryFromPlaidStepResults } from './summary'

export const PLAID_SYNC_STEPS = [
  { id: 'accounts', label: 'Cuentas y balances' },
  { id: 'liabilities', label: 'Tarjetas y préstamos' },
  { id: 'transactions', label: 'Transacciones' },
  { id: 'reconciliation', label: 'Conciliación' },
  { id: 'financial_refresh', label: 'Actualización financiera' },
] as const

export type PlaidSyncStepId = typeof PLAID_SYNC_STEPS[number]['id']
type Trigger = 'manual' | 'daily' | 'retry'

const ADDITIONAL_LIABILITIES_CONSENT =
  'ADDITIONAL_CONSENT_REQUIRED:PRODUCT_LIABILITIES'

function failedConnectionIds(results: Record<string, unknown>) {
  const ids = new Set<string>()
  for (const stepId of ['accounts', 'liabilities', 'transactions']) {
    const result = results[stepId] as {
      failed_connections?: Array<{ id?: string }>
    } | undefined
    for (const failure of result?.failed_connections || []) {
      if (failure.id) ids.add(failure.id)
    }
  }
  return ids
}

function liabilityWarningsByConnection(results: Record<string, unknown>) {
  const liabilities = results.liabilities as {
    unavailable_liabilities?: Array<{ id?: string; error_code?: string }>
  } | undefined
  return new Map(
    (liabilities?.unavailable_liabilities || [])
      .filter((item): item is { id: string; error_code?: string } =>
        Boolean(item.id)
      )
      .map((item) => [
        item.id,
        item.error_code === 'ADDITIONAL_CONSENT_REQUIRED'
          ? ADDITIONAL_LIABILITIES_CONSENT
          : `WARNING:PRODUCT_LIABILITIES:${item.error_code || 'UNAVAILABLE'}`,
      ])
  )
}

async function markConnectionSyncAttempts(
  supabase: SupabaseClient,
  userId: string,
  attemptedAt: string
) {
  const { data: before, error: lookupError } = await supabase
    .from('plaid_connections')
    .select('id, last_sync_attempt_at')
    .eq('user_id', userId)
    .is('archived_at', null)
    .neq('status', 'archived')
  if (lookupError) throw lookupError
  if (!before?.length) return

  const { data: updated, error } = await supabase
    .from('plaid_connections')
    .update({ last_sync_attempt_at: attemptedAt })
    .in('id', before.map((connection) => connection.id))
    .eq('user_id', userId)
    .is('archived_at', null)
    .neq('status', 'archived')
    .select('id, last_sync_attempt_at')
  if (error) throw error
  if ((updated || []).length !== before.length) {
    throw new Error(
      `Plaid connection attempt metadata update affected ${
        updated?.length || 0
      } of ${before.length} expected rows`
    )
  }

  const beforeById = new Map(
    before.map((connection) => [
      connection.id,
      connection.last_sync_attempt_at,
    ])
  )
  for (const connection of updated || []) {
    console.info('Plaid connection sync attempt metadata updated', {
      connection_id: connection.id,
      rows_affected: 1,
      before_last_sync_attempt_at: beforeById.get(connection.id) || null,
      after_last_sync_attempt_at: connection.last_sync_attempt_at,
    })
  }
}

async function recordConnectionSyncOutcomes(
  supabase: SupabaseClient,
  userId: string,
  results: Record<string, unknown>,
  completedAt: string
) {
  const { data, error } = await supabase
    .from('plaid_connections')
    .select('id, last_sync_at, last_sync_error')
    .eq('user_id', userId)
    .is('archived_at', null)
    .neq('status', 'archived')
  if (error) throw error

  const failed = failedConnectionIds(results)
  const liabilityWarnings = liabilityWarningsByConnection(results)
  for (const connection of data || []) {
    if (failed.has(connection.id)) continue
    const { data: updated, error: updateError } = await supabase
      .from('plaid_connections')
      .update({
        last_sync_at: completedAt,
        last_sync_error: liabilityWarnings.get(connection.id) || null,
      })
      .eq('id', connection.id)
      .eq('user_id', userId)
      .is('archived_at', null)
      .select('id, last_sync_at, last_sync_error')
      .maybeSingle()
    if (updateError) throw updateError
    if (!updated) {
      throw new Error(
        `Plaid connection outcome metadata update affected 0 rows for ${connection.id}`
      )
    }
    console.info('Plaid connection sync outcome metadata updated', {
      connection_id: updated.id,
      rows_affected: 1,
      before_last_sync_at: connection.last_sync_at,
      after_last_sync_at: updated.last_sync_at,
      before_warning: connection.last_sync_error || null,
      persisted_warning: updated.last_sync_error || null,
    })
  }
}

export async function latestPlaidSyncRun(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from('plaid_sync_runs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data
}

export async function queuePlaidSyncRun({ userId, trigger, retryOfRunId }: { userId: string; trigger: Trigger; retryOfRunId?: string | null }) {
  const supabase = getSupabaseAdmin()
  const now = new Date()
  await supabase.from('plaid_sync_runs').update({ status: 'failed', error_message: 'La ejecución anterior perdió su bloqueo.', completed_at: now.toISOString(), lock_expires_at: null }).eq('user_id', userId).in('status', ['queued', 'running']).lt('lock_expires_at', now.toISOString())

  const { data: active } = await supabase.from('plaid_sync_runs').select('*').eq('user_id', userId).in('status', ['queued', 'running']).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (active) return { run: active, created: false, reason: 'active' as const }

  const dailyWindowKey = trigger === 'daily' ? now.toISOString().slice(0, 10) : null
  if (dailyWindowKey) {
    const { data: prior } = await supabase.from('plaid_sync_runs').select('*').eq('user_id', userId).eq('trigger', 'daily').eq('daily_window_key', dailyWindowKey).limit(1).maybeSingle()
    if (prior) return { run: prior, created: false, reason: 'daily_window' as const }
  }

  let retryStep: string | null = null
  let priorResults: Record<string, unknown> = {}
  if (retryOfRunId) {
    const { data: prior } = await supabase.from('plaid_sync_runs').select('retryable_step, step_results').eq('id', retryOfRunId).eq('user_id', userId).maybeSingle()
    retryStep = prior?.retryable_step || null
    priorResults = prior?.step_results || {}
  }
  const completed = retryStep ? Math.max(PLAID_SYNC_STEPS.findIndex((step) => step.id === retryStep), 0) : 0
  const { data, error } = await supabase.from('plaid_sync_runs').insert({
    user_id: userId, trigger, daily_window_key: dailyWindowKey, status: 'queued', current_step: retryStep || 'accounts',
    completed_steps: completed, percentage: completed * 20, step_results: priorResults, retry_of_run_id: retryOfRunId || null,
    lock_expires_at: new Date(now.getTime() + 15 * 60_000).toISOString(),
  }).select('*').single()
  if (error) {
    const { data: concurrent } = await supabase.from('plaid_sync_runs').select('*').eq('user_id', userId).in('status', ['queued', 'running']).limit(1).maybeSingle()
    if (concurrent) return { run: concurrent, created: false, reason: 'active' as const }
    throw error
  }
  return { run: data, created: true, reason: 'created' as const }
}

export async function executePlaidSyncRun(runId: string, userId: string) {
  const supabase = getSupabaseAdmin()
  const { data: run, error } = await supabase.from('plaid_sync_runs').select('*').eq('id', runId).eq('user_id', userId).single()
  if (error || !run || !['queued', 'running'].includes(run.status)) return
  const started = Date.now()
  const results = { ...(run.step_results || {}) } as Record<string, unknown>
  const warnings = [...(run.warnings || [])] as string[]
  const startIndex = Math.max(PLAID_SYNC_STEPS.findIndex((step) => step.id === run.current_step), 0)
  await supabase.from('plaid_sync_runs').update({ status: 'running', started_at: run.started_at || new Date().toISOString(), last_heartbeat_at: new Date().toISOString() }).eq('id', runId)
  if (startIndex <= 2) {
    await markConnectionSyncAttempts(supabase, userId, new Date().toISOString())
  }

  for (let index = startIndex; index < PLAID_SYNC_STEPS.length; index += 1) {
    const step = PLAID_SYNC_STEPS[index]
    await supabase.from('plaid_sync_runs').update({ current_step: step.id, last_heartbeat_at: new Date().toISOString(), lock_expires_at: new Date(Date.now() + 15 * 60_000).toISOString() }).eq('id', runId)
    try {
      if (step.id === 'accounts') results.accounts = await syncPlaidAccountsForUser(supabase, userId, { accounts: true, liabilities: false, deferConnectionSuccessMetadata: true })
      if (step.id === 'liabilities') results.liabilities = await syncPlaidAccountsForUser(supabase, userId, { accounts: false, liabilities: true, deferConnectionSuccessMetadata: true })
      if (step.id === 'transactions') {
        results.transactions = await syncPlaidImportsForUser(userId, {
          reconcile: false,
          deferConnectionSuccessMetadata: true,
        })
        await recordConnectionSyncOutcomes(
          supabase,
          userId,
          results,
          new Date().toISOString()
        )
      }
      if (step.id === 'reconciliation') {
        const payment = await reconcileOpenObligationsAfterPlaidSync(supabase, userId)
        const { count } = await supabase.from('income_schedule').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true)
        results.reconciliation = { payment, income_schedules_evaluated: count || 0 }
        warnings.push('La conciliación automática de ingresos no crea vínculos porque todavía no existe una relación autoritativa transacción-ingreso.')
      }
      if (step.id === 'financial_refresh') {
        const snapshot = await getFinancialEngineSnapshot(supabase, userId)
        results.financial_refresh = { generated_at: snapshot.generatedAt, decisions: snapshot.decisionEngineV1.length }
      }
      const stepResult = results[step.id] as { failed_connections?: unknown[]; unavailable_liabilities?: unknown[] } | undefined
      if (stepResult?.failed_connections?.length) warnings.push(`${stepResult.failed_connections.length} conexión(es) Plaid requieren atención en ${step.label.toLowerCase()}.`)
      if (stepResult?.unavailable_liabilities?.length) {
        const consentCount = (
          stepResult.unavailable_liabilities as Array<{ error_code?: string }>
        ).filter(
          (item) => item.error_code === 'ADDITIONAL_CONSENT_REQUIRED'
        ).length
        if (consentCount) {
          warnings.push(
            `${consentCount} instituciones requieren autorización adicional para tarjetas y préstamos.`
          )
        }
        const unavailableCount =
          stepResult.unavailable_liabilities.length - consentCount
        if (unavailableCount > 0) {
          warnings.push(
            `Plaid no ofreció datos de tarjetas o préstamos para ${unavailableCount} conexión(es).`
          )
        }
      }
      const completed = index + 1
      await supabase.from('plaid_sync_runs').update({ completed_steps: completed, percentage: completed * 20, step_results: results, summary: summaryFromPlaidStepResults(results), warnings: [...new Set(warnings)], last_heartbeat_at: new Date().toISOString() }).eq('id', runId)
    } catch (stepError) {
      const technicalError = serializePlaidSyncError(step.id, stepError)
      results[step.id] = { error: technicalError }
      await supabase.from('plaid_sync_runs').update({
        status: index > 0 ? 'partially_completed' : 'failed',
        error_message: `No pudimos completar ${step.label.toLowerCase()}.`,
        retryable_step: step.id,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        lock_expires_at: null,
        step_results: results,
        summary: summaryFromPlaidStepResults(results),
        warnings: [...new Set(warnings)],
      }).eq('id', runId)
      return
    }
  }

  const summary = summaryFromPlaidStepResults(results)
  await supabase.from('plaid_sync_runs').update({ status: 'completed', current_step: null, completed_steps: 5, percentage: 100, completed_at: new Date().toISOString(), duration_ms: Date.now() - started, error_message: null, retryable_step: null, lock_expires_at: null, step_results: results, summary, warnings: [...new Set(warnings)] }).eq('id', runId)
}
