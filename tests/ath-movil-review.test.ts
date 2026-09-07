import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  ATH_REVIEW_PAGE_SIZE,
  ATH_REVIEW_QUERY_BATCH_SIZE,
  athEmailReviewState,
  chunkAthReviewIds,
  matchesAthReviewFilter,
  parseAthReviewPage,
} from '../lib/ath-movil/review.ts'

const email = { id: 'email-1', direction: 'sent', is_ignored: false }
const candidate = (id: string, status = 'suggested', score = 90, rank = 1) => ({ id, status, score, rank })

test('one candidate is pending and high confidence', () => {
  const candidates = [candidate('one')]
  assert.equal(athEmailReviewState(email, candidates), 'pending')
  assert.equal(matchesAthReviewFilter(email, candidates, 'high-confidence'), true)
  assert.equal(matchesAthReviewFilter(email, candidates, 'ambiguous'), false)
})

test('multiple candidates are ambiguous and not high-confidence', () => {
  const ambiguityReason = {
    code: 'ambiguity',
    message: 'Los candidatos están dentro del margen de ambigüedad.',
    points: 0,
    positive: false,
  }
  const candidates = [
    { ...candidate('one'), reasons: [ambiguityReason] },
    { ...candidate('two', 'suggested', 89, 2), reasons: [ambiguityReason] },
  ]
  assert.equal(matchesAthReviewFilter(email, candidates, 'ambiguous'), true)
  assert.equal(matchesAthReviewFilter(email, candidates, 'high-confidence'), false)
})

test('confirmed, rejected, superseded, ignored and no-match states share stored status', () => {
  assert.equal(athEmailReviewState(email, [candidate('one', 'confirmed')]), 'confirmed')
  assert.equal(athEmailReviewState(email, [candidate('one', 'rejected')]), 'rejected')
  assert.equal(athEmailReviewState(email, [candidate('one', 'superseded')]), 'superseded')
  assert.equal(athEmailReviewState({ ...email, is_ignored: true }, []), 'ignored')
  assert.equal(athEmailReviewState(email, []), 'no-match')
  assert.equal(matchesAthReviewFilter(email, [], 'no-match'), true)
})

test('direction filters are independent from decision state', () => {
  assert.equal(matchesAthReviewFilter(email, [], 'sent'), true)
  assert.equal(matchesAthReviewFilter({ ...email, direction: 'received' }, [], 'received'), true)
  assert.equal(matchesAthReviewFilter({ ...email, direction: 'internal_transfer' }, [], 'internal-transfer'), true)
})

test('pagination handles more than 500 emails and every ID request remains bounded', () => {
  const ids = Array.from({ length: 552 }, (_, index) => `email-${index}`)
  const batches = chunkAthReviewIds(ids)
  assert.equal(ATH_REVIEW_PAGE_SIZE, 25)
  assert.equal(ATH_REVIEW_QUERY_BATCH_SIZE, 100)
  assert.equal(Math.ceil(ids.length / ATH_REVIEW_PAGE_SIZE), 23)
  assert.equal(batches.flat().length, 552)
  assert.ok(batches.every((batch) => batch.length <= ATH_REVIEW_QUERY_BATCH_SIZE))
  assert.equal(parseAthReviewPage('-4'), 1)
})

test('ATH review reuses the evidence-only decision endpoint and does not mutate the ledger', () => {
  const page = readFileSync(new URL('../app/ath-movil/page.tsx', import.meta.url), 'utf8')
  const list = readFileSync(new URL('../app/ath-movil/AthReviewList.tsx', import.meta.url), 'utf8')
  const endpoint = readFileSync(new URL('../app/api/ath-movil/candidates/[id]/decision/route.ts', import.meta.url), 'utf8')
  const queueCard = readFileSync(new URL('../app/lab/review-queue/ActionableTransactionCard.tsx', import.meta.url), 'utf8')
  const store = readFileSync(new URL('../lib/ath-movil/candidate-store.ts', import.meta.url), 'utf8')
  assert.match(list, /\/api\/ath-movil\/candidates\/\$\{candidateId\}\/decision/)
  assert.match(list, /!displayCandidate/)
  assert.match(list, /type="radio"/)
  assert.match(list, /Ver movimiento/)
  assert.match(page, /chunkAthReviewIds/)
  assert.match(endpoint, /decide_ath_movil_candidate/)
  assert.match(queueCard, /Coincidencia rechazada/)
  assert.match(queueCard, /status === 'rejected'/)
  assert.doesNotMatch(endpoint, /\.from\(['"](?:quick_entries|plaid_imports)['"]\)[\s\S]{0,300}\.(?:insert|update|upsert|delete)/)
  assert.doesNotMatch(list, /quick_entries|confirm-import|decide-transaction/)
  assert.match(store, /!existingByPair\.has\(match\.plaidImportId\)/)
  assert.doesNotMatch(store, /existingByPair\.delete/)
})
