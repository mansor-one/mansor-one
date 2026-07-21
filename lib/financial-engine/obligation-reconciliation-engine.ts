import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildReconciliationMatches,
  type ReconciliationMatch,
  type ReconciliationPaymentInstance,
  type ReconciliationTransaction,
} from './reconciliation.ts'

export const AUTO_RECONCILIATION_THRESHOLD = 90

export function selectAutomaticReconciliations(matches: ReconciliationMatch[]) {
  const eligible = matches.filter((match) =>
    match.confidence >= AUTO_RECONCILIATION_THRESHOLD &&
    match.amountDifference <= 1 &&
    match.dateDifferenceDays !== null &&
    match.dateDifferenceDays <= 10 &&
    match.scoreFactors.some((factor) =>
      factor.passed && ['merchant_pattern_match', 'identity_compatible', 'institution_match', 'payment_account_match'].includes(factor.code)
    )
  )
  const transactionCounts = new Map<string, number>()
  const paymentCounts = new Map<string, number>()

  for (const match of eligible) {
    const transactionKey = `${match.transactionSource}:${match.transactionId}`
    transactionCounts.set(transactionKey, (transactionCounts.get(transactionKey) || 0) + 1)
    paymentCounts.set(match.paymentInstanceId, (paymentCounts.get(match.paymentInstanceId) || 0) + 1)
  }

  return eligible.filter((match) =>
    transactionCounts.get(`${match.transactionSource}:${match.transactionId}`) === 1 &&
    paymentCounts.get(match.paymentInstanceId) === 1
  )
}

type ReconciliationRunSummary = {
  candidatesDetected: number
  automaticallyReconciled: number
  ambiguousHighConfidenceMatches: number
}

export async function reconcileOpenObligationsAfterPlaidSync(
  supabase: SupabaseClient,
  userId: string
): Promise<ReconciliationRunSummary> {
  const [instancesResult, importsResult, linksResult] = await Promise.all([
    supabase
      .from('obligation_instances')
      .select('id, amount_expected, status, effective_due_date, updated_at, notes, obligations(name, default_amount, frequency)')
      .eq('user_id', userId)
      .in('status', ['pending', 'initiated']),
    supabase
      .from('plaid_imports')
      .select('id, merchant, amount, transaction_date, institution_name, account_name, account_type, account_subtype, suggested_category')
      .eq('user_id', userId)
      .eq('pending', false)
      .eq('transaction_status', 'active'),
    supabase
      .from('obligation_payment_links')
      .select('id, obligation_instance_id, plaid_import_id, reconciliation_status')
      .eq('user_id', userId),
  ])

  if (instancesResult.error) throw instancesResult.error
  if (importsResult.error) throw importsResult.error
  if (linksResult.error) throw linksResult.error

  const linkedTransactionIds = new Set(
    (linksResult.data || [])
      .filter((link) => link.reconciliation_status === 'reconciled' && link.plaid_import_id)
      .map((link) => link.plaid_import_id as string)
  )
  const existingLinkKeys = new Set(
    (linksResult.data || [])
      .filter((link) => link.plaid_import_id)
      .map((link) => `${link.obligation_instance_id}:${link.plaid_import_id}`)
  )
  const payments: ReconciliationPaymentInstance[] = (instancesResult.data || []).map((row) => {
    const obligation = Array.isArray(row.obligations) ? row.obligations[0] : row.obligations
    return {
      id: row.id,
      name: obligation?.name || null,
      amount: Number(row.amount_expected ?? obligation?.default_amount ?? 0),
      status: row.status,
      effective_due_date: row.effective_due_date,
      updated_at: row.updated_at,
      notes: row.notes,
      recurrence: obligation?.frequency || null,
    }
  })
  const transactions: ReconciliationTransaction[] = (importsResult.data || [])
    .filter((row) => !linkedTransactionIds.has(row.id))
    .map((row) => ({
      source: 'plaid_imports',
      id: row.id,
      name: row.merchant,
      amount: Number(row.amount || 0),
      date: row.transaction_date,
      institutionName: row.institution_name,
      accountName: row.account_name,
      accountType: row.account_type,
      accountSubtype: row.account_subtype,
      category: row.suggested_category,
    }))

  const reconciliation = buildReconciliationMatches({ transactions, payments })
  const candidates = reconciliation.allMatches.filter((match) => match.confidence >= 50)
  const automatic = selectAutomaticReconciliations(candidates)
  const automaticKeys = new Set(automatic.map((match) => `${match.paymentInstanceId}:${match.transactionId}`))
  let candidatesDetected = 0
  let automaticallyReconciled = 0

  for (const match of candidates) {
    const key = `${match.paymentInstanceId}:${match.transactionId}`
    const shouldReconcile = automaticKeys.has(key)
    const now = new Date().toISOString()
    let linkId = (linksResult.data || []).find((link) =>
      link.obligation_instance_id === match.paymentInstanceId && link.plaid_import_id === match.transactionId
    )?.id || null

    if (!linkId) {
      const { data, error } = await supabase.from('obligation_payment_links').insert({
        user_id: userId,
        obligation_instance_id: match.paymentInstanceId,
        plaid_import_id: match.transactionId,
        link_source: 'reconciliation',
        reconciliation_status: shouldReconcile ? 'reconciled' : 'detected',
        confidence: match.confidence,
        score_factors: match.scoreFactors,
        reconciled_at: shouldReconcile ? now : null,
        notes: match.reasons.join(' '),
      }).select('id').single()
      if (error) throw error
      linkId = data.id
      existingLinkKeys.add(key)
      candidatesDetected += 1
      if (!shouldReconcile) {
        const { error: detectedEventError } = await supabase.from('obligation_reconciliation_events').insert({
          user_id: userId,
          obligation_instance_id: match.paymentInstanceId,
          payment_link_id: linkId,
          event_type: 'payment_detected',
          from_status: match.paymentStatus,
          to_status: 'payment_detected',
          confidence: match.confidence,
          evidence: { transaction_source: match.transactionSource, transaction_id: match.transactionId, factors: match.scoreFactors },
        })
        if (detectedEventError) throw detectedEventError
      }
    } else if (shouldReconcile) {
      const { error } = await supabase.from('obligation_payment_links').update({
        reconciliation_status: 'reconciled', confidence: match.confidence,
        score_factors: match.scoreFactors, reconciled_at: now, updated_at: now,
      }).eq('id', linkId).eq('user_id', userId)
      if (error) throw error
    }

    if (!shouldReconcile) continue

    const { error: instanceError } = await supabase.from('obligation_instances').update({
      status: 'confirmed', updated_at: now,
    }).eq('id', match.paymentInstanceId).eq('user_id', userId).in('status', ['pending', 'initiated'])
    if (instanceError) throw instanceError

    const { error: eventError } = await supabase.from('obligation_reconciliation_events').insert({
      user_id: userId,
      obligation_instance_id: match.paymentInstanceId,
      payment_link_id: linkId,
      event_type: 'auto_reconciled',
      from_status: match.paymentStatus,
      to_status: 'reconciled',
      confidence: match.confidence,
      evidence: { transaction_source: match.transactionSource, transaction_id: match.transactionId, factors: match.scoreFactors },
    })
    if (eventError) throw eventError
    automaticallyReconciled += 1
  }

  return {
    candidatesDetected,
    automaticallyReconciled,
    ambiguousHighConfidenceMatches: candidates.filter((match) =>
      match.confidence >= AUTO_RECONCILIATION_THRESHOLD && !automaticKeys.has(`${match.paymentInstanceId}:${match.transactionId}`)
    ).length,
  }
}
