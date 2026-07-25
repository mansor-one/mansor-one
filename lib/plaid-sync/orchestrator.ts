import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { syncPlaidAccountsForUser } from '@/app/api/plaid/sync-accounts/route'
import { syncPlaidImportsForUser } from '@/app/api/plaid/sync-imports/route'
import { reconcileOpenObligationsAfterPlaidSync } from '@/lib/financial-engine/obligation-reconciliation-engine'
import { getFinancialEngineSnapshot } from '@/lib/financial-engine/snapshot'

export const PLAID_SYNC_STEPS = [
  { id: 'accounts', label: 'Cuentas y balances' },
  { id: 'liabilities', label: 'Tarjetas y préstamos' },
  { id: 'transactions', label: 'Transacciones' },
  { id: 'reconciliation', label: 'Conciliación' },
  { id: 'financial_refresh', label: 'Actualización financiera' },
] as const

export type PlaidSyncStepId = typeof PLAID_SYNC_STEPS[number]['id']
type Trigger = 'manual' | 'daily' | 'retry'

function summaryFromResults(results: Record<string, unknown>) {
  const accounts = results.accounts as { synced_accounts?: number } | undefined
  const liabilities = results.liabilities as { synced_credit_liabilities?: number } | undefined
  const transactions = results.transactions as { new_imports_created?: number; modified_imports_updated?: number } | undefined
  const reconciliation = results.reconciliation as { payment?: { automaticallyReconciled?: number } } | undefined
  return { accounts_updated: accounts?.synced_accounts || 0, liabilities_updated: liabilities?.synced_credit_liabilities || 0, transactions_added_or_updated: (transactions?.new_imports_created || 0) + (transactions?.modified_imports_updated || 0), payments_reconciled: reconciliation?.payment?.automaticallyReconciled || 0 }
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

  for (let index = startIndex; index < PLAID_SYNC_STEPS.length; index += 1) {
    const step = PLAID_SYNC_STEPS[index]
    await supabase.from('plaid_sync_runs').update({ current_step: step.id, last_heartbeat_at: new Date().toISOString(), lock_expires_at: new Date(Date.now() + 15 * 60_000).toISOString() }).eq('id', runId)
    try {
      if (step.id === 'accounts') results.accounts = await syncPlaidAccountsForUser(supabase, userId, { accounts: true, liabilities: false })
      if (step.id === 'liabilities') results.liabilities = await syncPlaidAccountsForUser(supabase, userId, { accounts: false, liabilities: true })
      if (step.id === 'transactions') results.transactions = await syncPlaidImportsForUser(userId, { reconcile: false })
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
      if (stepResult?.unavailable_liabilities?.length) warnings.push(`Plaid no ofreció datos de tarjetas o préstamos para ${stepResult.unavailable_liabilities.length} conexión(es).`)
      const completed = index + 1
      await supabase.from('plaid_sync_runs').update({ completed_steps: completed, percentage: completed * 20, step_results: results, summary: summaryFromResults(results), warnings, last_heartbeat_at: new Date().toISOString() }).eq('id', runId)
    } catch (stepError) {
      const message = stepError instanceof Error ? stepError.message : String(stepError)
      await supabase.from('plaid_sync_runs').update({ status: index > 0 ? 'partially_completed' : 'failed', error_message: message, retryable_step: step.id, completed_at: new Date().toISOString(), duration_ms: Date.now() - started, lock_expires_at: null, step_results: results, warnings }).eq('id', runId)
      return
    }
  }

  const summary = summaryFromResults(results)
  await supabase.from('plaid_sync_runs').update({ status: 'completed', current_step: null, completed_steps: 5, percentage: 100, completed_at: new Date().toISOString(), duration_ms: Date.now() - started, error_message: null, retryable_step: null, lock_expires_at: null, step_results: results, summary, warnings }).eq('id', runId)
}
