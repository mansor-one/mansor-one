import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { canonicalCategoryCodeForText, getCategoryByCode } from '../lib/financial-engine/categories.ts'
import {
  ATH_CONTEXT_EXTRACTOR_VERSION,
  ATH_CONTEXT_INTERPRETER_VERSION,
  interpretAthTransactionContext,
  normalizeContextText,
} from '../lib/transaction-intelligence/ath-context-interpreter.ts'
import {
  ATH_CONTEXT_MATCH_THRESHOLDS,
  isAthEvidenceEligible,
  selectEligibleAthEvidence,
} from '../lib/transaction-intelligence/ath-evidence-eligibility.ts'
import {
  TRANSACTION_CONTEXT_BATCH_SIZE,
  transactionContextChunks,
} from '../lib/transaction-intelligence/context-batching.ts'

const people = [
  { id: 'person-a', name: 'Persona Álvarez', relationship: 'family' },
  { id: 'person-b', name: 'Persona Beta', relationship: 'family' },
]

const matchReasons = (ambiguous = false) => [
  { code: 'amount_exact', positive: true, points: 40, message: 'Amount.' },
  { code: 'direction_compatible', positive: true, points: 10, message: 'Direction.' },
  { code: 'ambiguity', positive: !ambiguous, points: 0, message: 'Ambiguity.' },
]

const candidate = (overrides: Record<string, unknown> = {}) => ({
  id: 'candidate-a',
  plaid_import_id: 'plaid-a',
  score: 90,
  rank: 1,
  status: 'suggested',
  reasons: matchReasons(),
  ...overrides,
})

test('Phase 1A emits only canonical category codes from the approved registry', () => {
  for (const message of ['tennis', 'gasolina', 'food', 'restaurant', 'groceries', 'tuition', 'school supplies', 'clothing']) {
    const result = interpretAthTransactionContext({ message, counterparty: null, people: [] })
    assert.ok(result.categoryCandidates.length > 0, message)
    for (const suggestion of result.categoryCandidates) {
      assert.equal(getCategoryByCode(suggestion.categoryCode)?.code, suggestion.categoryCode)
    }
  }
  assert.equal(ATH_CONTEXT_EXTRACTOR_VERSION, 'ath-context-extractor-v1')
  assert.equal(ATH_CONTEXT_INTERPRETER_VERSION, 'ath-context-interpreter-v1')
})

test('legacy aliases continue to map without becoming the persisted identity', () => {
  assert.equal(canonicalCategoryCodeForText('Gasolina'), 'transportation_gas')
  assert.equal(canonicalCategoryCodeForText('Comida fuera'), 'food_restaurants')
  assert.equal(canonicalCategoryCodeForText('Pago de tarjeta'), 'transfers_card_payment')
})

test('sports context finds a household person independently from category', () => {
  const result = interpretAthTransactionContext({ message: 'tenis Persona Alvarez', counterparty: null, people })
  assert.equal(result.relatedPersonId, 'person-a')
  assert.equal(result.relatedPersonName, 'Persona Álvarez')
  assert.deepEqual(result.categoryCandidates.map((item) => item.categoryCode), ['sports'])
  assert.equal(result.purpose, 'deporte')
  assert.equal(result.ambiguous, false)
  assert.ok(result.reasons.some((reason) => reason.code === 'related_person_household_match'))
})

test('a person alone never forces a family category', () => {
  const result = interpretAthTransactionContext({ message: 'candado Persona Beta', counterparty: null, people })
  assert.equal(result.relatedPersonId, 'person-b')
  assert.equal(result.categoryCandidates.length, 0)
  assert.equal(result.purpose, null)
  assert.equal(result.confidence, 0.45)
})

test('gas and food remains explicitly ambiguous', () => {
  const result = interpretAthTransactionContext({ message: 'gas and food', counterparty: null, people: [] })
  assert.equal(result.ambiguous, true)
  assert.deepEqual(new Set(result.categoryCandidates.map((item) => item.categoryCode)), new Set(['transportation_gas', 'food']))
  assert.ok(result.reasons.some((reason) => reason.code === 'multiple_concepts'))
})

test('education needs deterministic educational evidence', () => {
  assert.equal(interpretAthTransactionContext({ message: 'matrícula agosto', counterparty: null, people: [] }).categoryCandidates[0].categoryCode, 'education_tuition')
  assert.equal(interpretAthTransactionContext({ message: 'school supplies', counterparty: null, people: [] }).categoryCandidates[0].categoryCode, 'education_school_supplies')
  const structured = interpretAthTransactionContext({ message: 'Persona_Beta-6th-grade_Agosto-2026', counterparty: null, people })
  assert.equal(structured.relatedPersonId, 'person-b')
  assert.equal(structured.categoryCandidates[0].categoryCode, 'education_school')
  assert.ok(structured.confidence < 0.8)
})

test('normalization handles accents and structured separators', () => {
  assert.equal(normalizeContextText('Matrícula_Persona-Álvarez'), 'matricula persona alvarez')
})

test('only confirmed or strong unique ATH evidence is eligible', () => {
  const strong = candidate()
  assert.equal(isAthEvidenceEligible(strong, [strong]), true)
  assert.equal(selectEligibleAthEvidence([strong])?.id, 'candidate-a')
  assert.equal(isAthEvidenceEligible(candidate({ score: ATH_CONTEXT_MATCH_THRESHOLDS.strongScore - 1 }), [candidate({ score: 84 })]), false)
  assert.equal(isAthEvidenceEligible(candidate({ status: 'rejected' }), [candidate({ status: 'rejected' })]), false)
  assert.equal(isAthEvidenceEligible(candidate({ status: 'stale' }), [candidate({ status: 'stale' })]), false)
  assert.equal(isAthEvidenceEligible(candidate({ status: 'superseded' }), [candidate({ status: 'superseded' })]), false)
  const confirmed = candidate({ status: 'confirmed', score: 60 })
  assert.equal(isAthEvidenceEligible(confirmed, [confirmed]), true)
})

test('ambiguous or close competing ATH candidates are ineligible', () => {
  const ambiguous = candidate({ reasons: matchReasons(true) })
  assert.equal(isAthEvidenceEligible(ambiguous, [ambiguous]), false)
  const first = candidate({ score: 90 })
  const second = candidate({ id: 'candidate-b', plaid_import_id: 'plaid-b', score: 87, rank: 2 })
  assert.equal(isAthEvidenceEligible(first, [first, second]), false)
})

test('500+ evidence IDs are always batched below the request bound', () => {
  const ids = Array.from({ length: 552 }, (_, index) => `email-${index}`)
  const batches = transactionContextChunks(ids)
  assert.equal(TRANSACTION_CONTEXT_BATCH_SIZE, 100)
  assert.equal(batches.flat().length, ids.length)
  assert.ok(batches.every((batch) => batch.length <= 100))
})

test('migration is additive, idempotent and does not introduce transaction_categories', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260815120000_transaction_context_phase_1a.sql', import.meta.url), 'utf8')
  assert.match(migration, /suggested_category_code text/i)
  assert.match(migration, /ath_match_candidate_id uuid/i)
  assert.match(migration, /related_person_id uuid/i)
  assert.match(migration, /transaction_enrichments_ath_context_unique_idx/i)
  assert.match(migration, /transaction_suggestions_context_category_unique_idx/i)
  assert.doesNotMatch(migration, /create table[^;]*transaction_categories/i)
  assert.doesNotMatch(migration, /insert into[^;]*transaction_categories/i)
})

test('Phase 1A preserves review history and only deduplicates pending reviews', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260815120000_transaction_context_phase_1a.sql', import.meta.url), 'utf8')
  assert.match(migration, /transaction_review_items_suggestion_id_fkey[\s\S]*on delete restrict/i)
  assert.match(migration, /create unique index transaction_review_items_suggestion_unique_idx[\s\S]*where status = 'pending'/i)
  assert.doesNotMatch(migration, /on public\.transaction_review_items\(household_id, suggestion_id\);/i)
})

test('Phase 1A service-role grants are limited to the approved operations', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260815190313_transaction_context_service_role_minimum_privileges.sql', import.meta.url), 'utf8')
  assert.match(migration, /grant select, insert, update[\s\S]*transaction_enrichments[\s\S]*to service_role/i)
  assert.match(migration, /grant select, insert, update[\s\S]*transaction_suggestions[\s\S]*to service_role/i)
  assert.match(migration, /grant select, insert[\s\S]*transaction_review_items[\s\S]*to service_role/i)
  assert.doesNotMatch(migration, /grant[^;]*(delete|truncate|trigger|references)/i)
  assert.doesNotMatch(migration, /\bto\s+(anon|authenticated)\b/i)
  assert.doesNotMatch(migration, /\b(quick_entries|plaid_imports|obligations|payments)\b/i)
  assert.doesNotMatch(migration, /\bsequence\b/i)
})

test('Gmail/ATH enrichment cannot mutate financial authority', () => {
  const store = readFileSync(new URL('../lib/transaction-intelligence/context-store.ts', import.meta.url), 'utf8')
  const importer = readFileSync(new URL('../app/api/gmail/ath-import/route.ts', import.meta.url), 'utf8')
  const reprocess = readFileSync(new URL('../app/api/gmail/ath-reprocess/route.ts', import.meta.url), 'utf8')
  for (const source of [store, importer, reprocess]) {
    assert.doesNotMatch(source, /\.from\(['"]quick_entries['"]\)[\s\S]{0,250}\.(insert|update|upsert|delete)/)
    assert.doesNotMatch(source, /\.from\(['"](?:obligations|payment_instances|scheduled_payments)['"]\)/)
    assert.doesNotMatch(source, /confirm_review_transaction|promotePlaidImportToQuickEntry|FinancialEngineSnapshot/)
  }
  assert.doesNotMatch(store, /\.from\(['"]plaid_imports['"]\)[\s\S]{0,250}\.(insert|update|upsert|delete)/)
})

test('persistence is household-scoped and uses database-enforced idempotency keys', () => {
  const store = readFileSync(new URL('../lib/transaction-intelligence/context-store.ts', import.meta.url), 'utf8')
  assert.match(store, /from\('people'\)[\s\S]*\.eq\('household_id', householdId\)/)
  assert.match(store, /onConflict: 'household_id,ath_match_candidate_id,enrichment_type'/)
  assert.match(store, /onConflict: 'household_id,enrichment_id,suggested_category_code'/)
  assert.match(store, /existingReviewSuggestionIds/)
})

test('Review Queue displays intelligence and only preselects its existing category flow', () => {
  const queue = readFileSync(new URL('../lib/financial-engine/review-queue.ts', import.meta.url), 'utf8')
  const card = readFileSync(new URL('../app/lab/review-queue/ActionableTransactionCard.tsx', import.meta.url), 'utf8')
  assert.match(queue, /loadTransactionContextsForPlaidImports/)
  assert.match(card, /Robototina sugiere/)
  assert.match(card, /Usar sugerencia/)
  assert.match(card, /setCategory\(selectedContextSuggestion\.displayName\)/)
  assert.doesNotMatch(card, /api\/ledger\/update-category/)
})
