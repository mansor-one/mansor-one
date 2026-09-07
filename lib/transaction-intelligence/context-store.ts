import 'server-only'

import type { getSupabaseAdmin } from '../supabase/admin.ts'
import { canonicalCategoryCodeForText, getCategoryByCode } from '../financial-engine/categories.ts'
import { interpretAthTransactionContext } from './ath-context-interpreter.ts'
import { selectEligibleAthEvidence } from './ath-evidence-eligibility.ts'
import { transactionContextChunks } from './context-batching.ts'
import { isTransactionContextSchemaUnavailable } from './context-types.ts'

type AdminClient = ReturnType<typeof getSupabaseAdmin>

export const TRANSACTION_CONTEXT_MIGRATION = '20260815120000_transaction_context_phase_1a.sql'

export type TransactionContextRefreshResult = {
  schemaAvailable: boolean
  eligibleEvidence: number
  enrichments: number
  suggestions: number
  reviewItems: number
}

const emptyResult = (schemaAvailable: boolean): TransactionContextRefreshResult => ({
  schemaAvailable,
  eligibleEvidence: 0,
  enrichments: 0,
  suggestions: 0,
  reviewItems: 0,
})

export async function enrichAthTransactionContexts({
  admin,
  householdId,
  userId,
  emailIds,
}: {
  admin: AdminClient
  householdId: string
  userId: string
  emailIds: string[]
}): Promise<TransactionContextRefreshResult> {
  const uniqueEmailIds = [...new Set(emailIds)].filter(Boolean)
  if (!uniqueEmailIds.length) return emptyResult(true)

  const preflight = await admin.from('transaction_enrichments')
    .select('id, ath_match_candidate_id, extractor_version, status')
    .limit(1)
  if (preflight.error) {
    if (isTransactionContextSchemaUnavailable(preflight.error)) {
      console.warn(`[Transaction Context] Migration ${TRANSACTION_CONTEXT_MIGRATION} is not applied; enrichment skipped safely.`)
      return emptyResult(false)
    }
    throw preflight.error
  }

  const [emailResults, candidateResults, peopleResult] = await Promise.all([
    Promise.all(transactionContextChunks(uniqueEmailIds).map((batch) => admin.from('ath_movil_emails')
      .select('id, user_id, household_id, message, counterparty_name, parse_status, is_ignored')
      .eq('household_id', householdId).in('id', batch))),
    Promise.all(transactionContextChunks(uniqueEmailIds).map((batch) => admin.from('ath_movil_match_candidates')
      .select('id, ath_email_id, plaid_import_id, score, rank, status, reasons')
      .eq('household_id', householdId).in('ath_email_id', batch).order('rank'))),
    admin.from('people').select('id, name, relationship').eq('household_id', householdId),
  ])
  for (const result of [...emailResults, ...candidateResults, peopleResult]) {
    if (result.error) throw result.error
  }
  const emails = emailResults.flatMap((result) => result.data || [])
  const candidates = candidateResults.flatMap((result) => result.data || [])
  const candidatesByEmail = new Map<string, typeof candidates>()
  for (const candidate of candidates) {
    const group = candidatesByEmail.get(candidate.ath_email_id) || []
    group.push(candidate)
    candidatesByEmail.set(candidate.ath_email_id, group)
  }

  const eligible = emails.flatMap((email) => {
    if (email.is_ignored || email.parse_status !== 'parsed') return []
    const group = candidatesByEmail.get(email.id) || []
    const candidate = selectEligibleAthEvidence(group)
    if (!candidate) return []
    return [{ email, candidate, interpretation: interpretAthTransactionContext({
      message: email.message,
      counterparty: email.counterparty_name,
      people: peopleResult.data || [],
    }) }]
  })
  if (!eligible.length) return emptyResult(true)

  const plaidIds = [...new Set(eligible.map((item) => item.candidate.plaid_import_id))]
  const plaidResults = await Promise.all(transactionContextChunks(plaidIds).map((batch) => admin.from('plaid_imports')
    .select('id, suggested_category').eq('household_id', householdId).in('id', batch)))
  for (const result of plaidResults) if (result.error) throw result.error
  const plaidById = new Map(plaidResults.flatMap((result) => result.data || []).map((item) => [item.id, item]))

  const enrichmentRows = eligible.map(({ email, candidate, interpretation }) => ({
    user_id: email.user_id || userId,
    household_id: householdId,
    plaid_import_id: candidate.plaid_import_id,
    quick_entry_id: null,
    enrichment_source: 'ath_movil_gmail',
    enrichment_type: 'transaction_context',
    matched_value: email.message,
    confidence_score: interpretation.confidence,
    ath_movil_email_id: email.id,
    ath_match_candidate_id: candidate.id,
    related_person_id: interpretation.relatedPersonId,
    purpose: interpretation.purpose,
    reasons: interpretation.reasons,
    extractor_version: interpretation.extractorVersion,
    status: interpretation.ambiguous
      ? 'ambiguous'
      : interpretation.categoryCandidates.length ? 'active' : 'insufficient_context',
    metadata: {
      counterparty: email.counterparty_name,
      relatedPersonName: interpretation.relatedPersonName,
      ambiguous: interpretation.ambiguous,
      interpreterVersion: interpretation.interpreterVersion,
      categoryCandidates: interpretation.categoryCandidates,
      evidenceMatchStatus: candidate.status,
      evidenceMatchScore: candidate.score,
    },
  }))
  const enrichmentResults = await Promise.all(transactionContextChunks(enrichmentRows).map((batch) => admin
    .from('transaction_enrichments')
    .upsert(batch, { onConflict: 'household_id,ath_match_candidate_id,enrichment_type' })
    .select('id, ath_match_candidate_id')))
  for (const result of enrichmentResults) if (result.error) throw result.error
  const enrichmentByCandidateId = new Map(enrichmentResults.flatMap((result) => result.data || [])
    .map((row) => [row.ath_match_candidate_id, row.id]))

  const suggestionInputs = eligible.flatMap(({ candidate, interpretation }) => {
    const enrichmentId = enrichmentByCandidateId.get(candidate.id)
    if (!enrichmentId) return []
    const currentCategoryCode = canonicalCategoryCodeForText(plaidById.get(candidate.plaid_import_id)?.suggested_category)
    return interpretation.categoryCandidates.map((categoryCandidate) => ({
      enrichmentId,
      candidate,
      interpretation,
      categoryCandidate,
      currentCategoryCode,
    }))
  })
  const suggestionRows = suggestionInputs.map(({ enrichmentId, candidate, interpretation, categoryCandidate }) => ({
    user_id: userId,
    household_id: householdId,
    plaid_import_id: candidate.plaid_import_id,
    quick_entry_id: null,
    enrichment_id: enrichmentId,
    source: 'ath_context',
    suggested_category: categoryCandidate.displayName,
    suggested_category_code: categoryCandidate.categoryCode,
    confidence_score: categoryCandidate.confidence,
    rank: categoryCandidate.rank,
    interpreter_version: interpretation.interpreterVersion,
    reason: categoryCandidate.reasons.map((reason) => reason.message).join(' '),
    status: interpretation.ambiguous ? 'needs_review' : 'suggested',
    metadata: {
      purpose: categoryCandidate.purpose,
      relatedPersonId: interpretation.relatedPersonId,
      relatedPersonName: interpretation.relatedPersonName,
      ambiguous: interpretation.ambiguous,
      reasons: categoryCandidate.reasons,
    },
  }))
  const suggestionResults = await Promise.all(transactionContextChunks(suggestionRows).map((batch) => admin
    .from('transaction_suggestions')
    .upsert(batch, { onConflict: 'household_id,enrichment_id,suggested_category_code' })
    .select('id, enrichment_id, suggested_category_code')))
  for (const result of suggestionResults) if (result.error) throw result.error
  const savedSuggestions = suggestionResults.flatMap((result) => result.data || [])

  const inputByKey = new Map(suggestionInputs.map((input) => [
    `${input.enrichmentId}:${input.categoryCandidate.categoryCode}`,
    input,
  ]))
  const actionableSuggestions = savedSuggestions.filter((suggestion) => {
    const input = inputByKey.get(`${suggestion.enrichment_id}:${suggestion.suggested_category_code}`)
    return Boolean(input && (
      input.interpretation.ambiguous ||
      input.categoryCandidate.categoryCode !== input.currentCategoryCode
    ))
  })
  const primaryActionable = actionableSuggestions.filter((suggestion) => {
    const input = inputByKey.get(`${suggestion.enrichment_id}:${suggestion.suggested_category_code}`)
    return input?.categoryCandidate.rank === 1
  })
  const existingReviewResults = await Promise.all(transactionContextChunks(primaryActionable.map((item) => item.id)).map((batch) => admin
    .from('transaction_review_items').select('suggestion_id').eq('household_id', householdId).in('suggestion_id', batch)))
  for (const result of existingReviewResults) if (result.error) throw result.error
  const existingReviewSuggestionIds = new Set(existingReviewResults.flatMap((result) => result.data || []).map((item) => item.suggestion_id))
  const reviewRows = primaryActionable.filter((suggestion) => !existingReviewSuggestionIds.has(suggestion.id)).map((suggestion) => {
    const input = inputByKey.get(`${suggestion.enrichment_id}:${suggestion.suggested_category_code}`)
    const category = input ? getCategoryByCode(input.categoryCandidate.categoryCode) : null
    return {
      user_id: userId,
      household_id: householdId,
      suggestion_id: suggestion.id,
      question: input?.interpretation.ambiguous
        ? 'El contexto ATH contiene varios conceptos. ¿Qué categoría corresponde?'
        : `¿Usar ${category?.displayName || 'la categoría sugerida'} para esta transacción?`,
      status: 'pending',
    }
  })
  const reviewResults = await Promise.all(transactionContextChunks(reviewRows).map((batch) => admin
    .from('transaction_review_items').insert(batch).select('id')))
  for (const result of reviewResults) if (result.error) throw result.error

  return {
    schemaAvailable: true,
    eligibleEvidence: eligible.length,
    enrichments: enrichmentRows.length,
    suggestions: suggestionRows.length,
    reviewItems: reviewRows.length,
  }
}
