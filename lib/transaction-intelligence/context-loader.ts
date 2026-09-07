import type { FinancialSupabaseClient } from '../financial-engine/types.ts'
import { getCategoryByCode } from '../financial-engine/categories.ts'
import { transactionContextChunks } from './context-batching.ts'
import { isTransactionContextSchemaUnavailable, type TransactionContextReason } from './context-types.ts'

export type ReviewTransactionContextSuggestion = {
  id: string
  categoryCode: string
  displayName: string
  confidence: number
  rank: number
  status: string
  reasons: TransactionContextReason[]
}

export type ReviewTransactionContext = {
  enrichmentId: string
  evidence: { message: string | null; counterparty: string | null }
  relatedPersonId: string | null
  relatedPersonName: string | null
  purpose: string | null
  confidence: number
  reasons: TransactionContextReason[]
  ambiguous: boolean
  status: string
  extractorVersion: string | null
  suggestions: ReviewTransactionContextSuggestion[]
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function reasonValues(value: unknown): TransactionContextReason[] {
  return Array.isArray(value) ? value.filter((reason): reason is TransactionContextReason => Boolean(
    reason && typeof reason === 'object' &&
    'code' in reason && typeof reason.code === 'string' &&
    'message' in reason && typeof reason.message === 'string' &&
    'matchedTerms' in reason && Array.isArray(reason.matchedTerms)
  )) : []
}

export async function loadTransactionContextsForPlaidImports(
  supabase: FinancialSupabaseClient,
  plaidImportIds: string[]
) {
  const uniqueIds = [...new Set(plaidImportIds)].filter(Boolean)
  if (!uniqueIds.length) return new Map<string, ReviewTransactionContext>()
  const enrichmentResults = await Promise.all(transactionContextChunks(uniqueIds).map((batch) => supabase
    .from('transaction_enrichments')
    .select('id, plaid_import_id, matched_value, confidence_score, related_person_id, purpose, reasons, extractor_version, status, metadata')
    .eq('enrichment_source', 'ath_movil_gmail')
    .eq('enrichment_type', 'transaction_context')
    .in('status', ['active', 'ambiguous', 'insufficient_context'])
    .in('plaid_import_id', batch)))
  if (enrichmentResults.some((result) => result.error)) {
    const error = enrichmentResults.find((result) => result.error)?.error
    if (isTransactionContextSchemaUnavailable(error)) return new Map<string, ReviewTransactionContext>()
    throw error
  }
  const enrichments = enrichmentResults.flatMap((result) => result.data || [])
  const enrichmentIds = enrichments.map((item) => item.id)
  const personIds = [...new Set(enrichments.map((item) => item.related_person_id).filter((id): id is string => Boolean(id)))]
  const [suggestionResults, peopleResults] = await Promise.all([
    Promise.all(transactionContextChunks(enrichmentIds).map((batch) => supabase
      .from('transaction_suggestions')
      .select('id, enrichment_id, suggested_category_code, confidence_score, rank, status, reason, metadata')
      .eq('source', 'ath_context')
      .in('status', ['suggested', 'needs_review', 'confirmed'])
      .in('enrichment_id', batch)
      .order('rank'))),
    Promise.all(transactionContextChunks(personIds).map((batch) => supabase
      .from('people').select('id, name').in('id', batch))),
  ])
  const allResults = [...suggestionResults, ...peopleResults]
  if (allResults.some((result) => result.error)) {
    const error = allResults.find((result) => result.error)?.error
    if (isTransactionContextSchemaUnavailable(error)) return new Map<string, ReviewTransactionContext>()
    throw error
  }
  const peopleById = new Map(peopleResults.flatMap((result) => result.data || []).map((person) => [person.id, person.name]))
  const suggestionsByEnrichment = new Map<string, ReviewTransactionContextSuggestion[]>()
  for (const suggestion of suggestionResults.flatMap((result) => result.data || [])) {
    const category = suggestion.suggested_category_code ? getCategoryByCode(suggestion.suggested_category_code) : null
    if (!category || !suggestion.enrichment_id) continue
    const metadata = objectValue(suggestion.metadata)
    const list = suggestionsByEnrichment.get(suggestion.enrichment_id) || []
    list.push({
      id: suggestion.id,
      categoryCode: category.code,
      displayName: category.displayName,
      confidence: Number(suggestion.confidence_score || 0),
      rank: suggestion.rank,
      status: suggestion.status,
      reasons: reasonValues(metadata.reasons),
    })
    suggestionsByEnrichment.set(suggestion.enrichment_id, list)
  }
  const contexts = new Map<string, ReviewTransactionContext>()
  for (const enrichment of enrichments.sort((left, right) => Number(right.confidence_score || 0) - Number(left.confidence_score || 0))) {
    if (!enrichment.plaid_import_id || contexts.has(enrichment.plaid_import_id)) continue
    const metadata = objectValue(enrichment.metadata)
    contexts.set(enrichment.plaid_import_id, {
      enrichmentId: enrichment.id,
      evidence: {
        message: enrichment.matched_value,
        counterparty: typeof metadata.counterparty === 'string' ? metadata.counterparty : null,
      },
      relatedPersonId: enrichment.related_person_id,
      relatedPersonName: enrichment.related_person_id
        ? peopleById.get(enrichment.related_person_id) || null
        : typeof metadata.relatedPersonName === 'string' ? metadata.relatedPersonName : null,
      purpose: enrichment.purpose,
      confidence: Number(enrichment.confidence_score || 0),
      reasons: reasonValues(enrichment.reasons),
      ambiguous: enrichment.status === 'ambiguous' || metadata.ambiguous === true,
      status: enrichment.status,
      extractorVersion: enrichment.extractor_version,
      suggestions: (suggestionsByEnrichment.get(enrichment.id) || []).sort((left, right) => left.rank - right.rank),
    })
  }
  return contexts
}
