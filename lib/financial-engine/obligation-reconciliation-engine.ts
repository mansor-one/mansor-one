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
    match.eligible &&
    match.evidenceKind === 'payment' &&
    match.confidence >= AUTO_RECONCILIATION_THRESHOLD &&
    match.amountDifference <= 0.009 &&
    match.dateDifferenceDays !== null &&
    match.dateDifferenceDays <= 10 &&
    match.scoreFactors.some((factor) =>
      factor.passed && ['merchant_pattern_match', 'provider_match', 'identity_compatible', 'institution_match', 'payment_account_match'].includes(factor.code)
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
  const [
    instancesResult,
    importsResult,
    linksResult,
    accountsResult,
    eventsResult,
  ] = await Promise.all([
    supabase
      .from('obligation_instances')
      .select('id, amount_expected, amount_is_estimated, status, effective_due_date, updated_at, notes, obligations(name, default_amount, amount_is_estimated, frequency, obligation_type, category_code, description, payment_method), obligation_providers(provider_name)')
      .eq('user_id', userId)
      .in('status', ['pending', 'initiated']),
    supabase
      .from('plaid_imports')
      .select('id, merchant, amount, transaction_date, institution_name, account_name, account_type, account_subtype, suggested_category, plaid_category, plaid_account_id')
      .eq('user_id', userId)
      .eq('pending', false)
      .eq('transaction_status', 'active'),
    supabase
      .from('obligation_payment_links')
      .select('id, obligation_instance_id, plaid_import_id, reconciliation_status, reported_amount, payment_account_id, payment_account_source')
      .eq('user_id', userId),
    supabase
      .from('plaid_accounts')
      .select('id, plaid_account_id, institution_name, name')
      .eq('user_id', userId),
    supabase
      .from('obligation_reconciliation_events')
      .select('payment_link_id, event_type')
      .eq('user_id', userId)
      .in('event_type', ['payment_detected', 'auto_reconciled']),
  ])

  if (instancesResult.error) throw instancesResult.error
  if (importsResult.error) throw importsResult.error
  if (linksResult.error) throw linksResult.error
  if (accountsResult.error) throw accountsResult.error
  if (eventsResult.error) throw eventsResult.error

  const existingEventKeys = new Set(
    (eventsResult.data || []).map(
      (event) => `${event.payment_link_id}:${event.event_type}`
    )
  )
  async function insertEventOnce(
    paymentLinkId: string,
    eventType: 'payment_detected' | 'auto_reconciled',
    values: Record<string, unknown>
  ) {
    const eventKey = `${paymentLinkId}:${eventType}`
    if (existingEventKeys.has(eventKey)) return
    const { error } = await supabase
      .from('obligation_reconciliation_events')
      .insert(values)
    if (error) throw error
    existingEventKeys.add(eventKey)
  }

  const linkedTransactionIds = new Set(
    (linksResult.data || [])
      .filter((link) => link.reconciliation_status === 'reconciled' && link.plaid_import_id)
      .map((link) => link.plaid_import_id as string)
  )
  const rejectedMatchKeys = new Set(
    (linksResult.data || [])
      .filter((link) => link.reconciliation_status === 'rejected' && link.plaid_import_id)
      .map((link) => `${link.obligation_instance_id}:plaid_imports:${link.plaid_import_id}`)
  )
  const pendingLinksByInstance = new Map(
    (linksResult.data || [])
      .filter((link) =>
        link.reconciliation_status === 'pending_settlement' &&
        !link.plaid_import_id
      )
      .map((link) => [link.obligation_instance_id, link])
  )
  const plaidAccountsById = new Map(
    (accountsResult.data || []).map((account) => [account.id, account])
  )
  const payments: ReconciliationPaymentInstance[] = (instancesResult.data || []).map((row) => {
    const obligation = Array.isArray(row.obligations) ? row.obligations[0] : row.obligations
    const provider = Array.isArray(row.obligation_providers)
      ? row.obligation_providers[0]
      : row.obligation_providers
    const pendingLink = pendingLinksByInstance.get(row.id)
    const fundingAccount = pendingLink?.payment_account_source === 'plaid_account'
      ? plaidAccountsById.get(pendingLink.payment_account_id)
      : null
    return {
      id: row.id,
      name: obligation?.name || null,
      amount: Number(pendingLink?.reported_amount ?? row.amount_expected ?? obligation?.default_amount ?? 0),
      status: row.status,
      effective_due_date: row.effective_due_date,
      updated_at: row.updated_at,
      notes: row.notes,
      recurrence: obligation?.frequency || null,
      fundingPlaidAccountId: fundingAccount?.plaid_account_id || null,
      fundingAccountName: fundingAccount
        ? `${fundingAccount.institution_name || ''} ${fundingAccount.name || ''}`.trim()
        : obligation?.payment_method || null,
      amountIsEstimated: row.amount_is_estimated || obligation?.amount_is_estimated || false,
      providerName: provider?.provider_name || null,
      obligationType: obligation?.obligation_type || null,
      categoryCode: obligation?.category_code || null,
      contextNotes: [obligation?.description, row.notes].filter(Boolean).join(' ') || null,
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
      category: row.suggested_category || row.plaid_category,
      plaidAccountId: row.plaid_account_id,
    }))

  const reconciliation = buildReconciliationMatches({
    transactions,
    payments,
    rejectedMatchKeys,
  })
  const candidates = reconciliation.allMatches.filter(
    (match) => match.eligible && match.confidence >= 50
  )
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
      candidatesDetected += 1
    } else if (shouldReconcile) {
      const { error } = await supabase.from('obligation_payment_links').update({
        reconciliation_status: 'reconciled', confidence: match.confidence,
        score_factors: match.scoreFactors, reconciled_at: now, updated_at: now,
      }).eq('id', linkId).eq('user_id', userId)
      if (error) throw error
    }

    if (!shouldReconcile) {
      await insertEventOnce(linkId, 'payment_detected', {
        user_id: userId,
        obligation_instance_id: match.paymentInstanceId,
        payment_link_id: linkId,
        event_type: 'payment_detected',
        from_status: match.paymentStatus,
        to_status: 'payment_detected',
        confidence: match.confidence,
        evidence: { transaction_source: match.transactionSource, transaction_id: match.transactionId, factors: match.scoreFactors },
      })
      continue
    }

    await insertEventOnce(linkId, 'auto_reconciled', {
      user_id: userId,
      obligation_instance_id: match.paymentInstanceId,
      payment_link_id: linkId,
      event_type: 'auto_reconciled',
      from_status: match.paymentStatus,
      to_status: 'reconciled',
      confidence: match.confidence,
      evidence: { transaction_source: match.transactionSource, transaction_id: match.transactionId, factors: match.scoreFactors },
    })

    const { error: instanceError } = await supabase.from('obligation_instances').update({
      status: 'confirmed', updated_at: now,
    }).eq('id', match.paymentInstanceId).eq('user_id', userId).in('status', ['pending', 'initiated'])
    if (instanceError) throw instanceError
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
