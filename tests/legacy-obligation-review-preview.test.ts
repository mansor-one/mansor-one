import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildLegacyObligationReview,
  summarizeLegacyReviewDecisions,
  type LegacyReviewAthEmail,
  type LegacyReviewPlaidCandidate,
} from '../lib/financial-engine/legacy-obligation-review.ts'

const householdId = 'household-cellular'
const schedule = {
  id: 'schedule-cellular',
  household_id: householdId,
  name: 'Celulares',
  owner: 'Soraya',
  amount: 171.25,
}

function email(overrides: Partial<LegacyReviewAthEmail>): LegacyReviewAthEmail {
  return {
    id: 'email',
    household_id: householdId,
    occurred_at: '2026-08-03T12:11:00.000Z',
    email_date: '2026-08-03T12:11:00.000Z',
    direction: 'sent',
    counterparty_name: 'Soraya',
    amount: 200,
    message: 'teléfono Soraya celulares',
    subject: 'ATH Móvil',
    is_ignored: false,
    ...overrides,
  }
}

function candidate(id: string, rank: number): LegacyReviewPlaidCandidate {
  return {
    id,
    plaidImportId: `plaid-${id}`,
    score: 70,
    rank,
    status: 'suggested',
    reasons: [
      { code: 'amount_exact', message: 'El importe ATH coincide.', positive: true, points: 40 },
      { code: 'ambiguity', message: 'Existen alternativas equivalentes.', positive: false, points: 0 },
    ],
    amount: 200,
    transactionDate: '2026-08-03',
    merchant: 'ATH MOVIL PHONE',
    institutionName: 'FirstBank',
    accountName: 'Cuenta Perfecta',
  }
}

test('Celulares preview finds both outgoing payments and the later Soraya reimbursement', () => {
  const paymentA = email({ id: 'out-a' })
  const paymentB = email({
    id: 'out-b',
    occurred_at: '2026-08-03T12:31:00.000Z',
    email_date: '2026-08-03T12:31:00.000Z',
    message: 'celulares Soraya atraso',
  })
  const reimbursement = email({
    id: 'in-a',
    occurred_at: '2026-08-06T12:07:00.000Z',
    email_date: '2026-08-06T12:07:00.000Z',
    direction: 'received',
    message: null,
  })
  const candidates = new Map([
    ['out-a', [candidate('a1', 1), candidate('a2', 2)]],
    ['out-b', [candidate('b1', 1), candidate('b2', 2)]],
    ['in-a', [candidate('r1', 1)]],
  ])

  const review = buildLegacyObligationReview({
    schedule,
    expectedDate: '2026-08-30',
    emails: [reimbursement, paymentB, paymentA],
    candidatesByEmail: candidates,
  })

  assert.equal(review.schedule.amount, 171.25)
  assert.deepEqual(review.possiblePayments.map((item) => item.id), ['out-a', 'out-b'])
  assert.deepEqual(review.possibleReimbursements.map((item) => item.id), ['in-a'])
  assert.equal(review.ambiguous, true)
  assert.equal(review.possiblePayments[0].candidates.length, 2)
})

test('local decisions represent a current payment, its complement, and a previous period payment', () => {
  const paymentA = email({ id: 'out-current' })
  const complement = email({
    id: 'out-complement',
    amount: 22,
    occurred_at: '2026-08-03T12:27:00.000Z',
    message: 'celulares Soraya adicional',
  })
  const previous = email({
    id: 'out-previous',
    occurred_at: '2026-08-03T12:31:00.000Z',
    message: 'celulares Soraya atraso',
  })
  const review = buildLegacyObligationReview({
    schedule,
    expectedDate: '2026-08-30',
    emails: [paymentA, complement, previous],
  })
  const summary = summarizeLegacyReviewDecisions(review, {
    'out-current': { classification: 'current' },
    'out-complement': {
      classification: 'complement',
      complementsPaymentId: 'out-current',
    },
    'out-previous': { classification: 'previous' },
  })

  assert.equal(review.schedule.amount, 171.25)
  assert.equal(summary.currentCycleTotal, 222)
  assert.equal(summary.previousPeriodTotal, 200)
  assert.equal(summary.selectedPayments[1].decision.complementsPaymentId, 'out-current')
})

test('evidence from another household is excluded even when text and amount match', () => {
  const review = buildLegacyObligationReview({
    schedule,
    expectedDate: '2026-08-30',
    emails: [
      email({ id: 'own' }),
      email({ id: 'foreign', household_id: 'household-other' }),
      email({
        id: 'foreign-reimbursement',
        household_id: 'household-other',
        direction: 'received',
        occurred_at: '2026-08-06T12:07:00.000Z',
      }),
    ],
  })

  assert.deepEqual(review.possiblePayments.map((item) => item.id), ['own'])
  assert.equal(review.possibleReimbursements.length, 0)
})

test('local preview starts with no decision and contains no persistence path', () => {
  const client = readFileSync(
    new URL('../app/repair-center/obligation-review/LegacyObligationReviewPreview.tsx', import.meta.url),
    'utf8'
  )
  const page = readFileSync(
    new URL('../app/repair-center/obligation-review/page.tsx', import.meta.url),
    'utf8'
  )

  assert.match(client, /useState<Record<string, LegacyReviewLocalPaymentDecision>>\(\{\}\)/)
  assert.match(client, /useState<Record<string, ReimbursementDecision>>\(\{\}\)/)
  assert.doesNotMatch(client, /fetch\(|localStorage|sessionStorage|<form|type="submit"/)
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|getSupabaseAdmin/)
  assert.match(client, /Complemento\/restante del ciclo/)
  assert.match(client, /No seleccionado/)
  assert.match(client, /No se modificará automáticamente el importe esperado/)
})

test('server loader scopes schedule, ATH candidates, and Plaid rows to the active household', () => {
  const page = readFileSync(
    new URL('../app/repair-center/obligation-review/page.tsx', import.meta.url),
    'utf8'
  )

  assert.match(page, /from\('household_members'\)/)
  assert.match(page, /from\('scheduled_payments'\)[\s\S]*?eq\('household_id', householdId\)/)
  assert.match(page, /from\('ath_movil_emails'\)[\s\S]*?eq\('household_id', householdId\)/)
  assert.match(page, /from\('ath_movil_match_candidates'\)[\s\S]*?eq\('household_id', householdId\)/)
  assert.match(page, /from\('plaid_imports'\)[\s\S]*?eq\('household_id', householdId\)/)
})

test('Repair integration links to the reusable preview route', () => {
  const configure = readFileSync(
    new URL('../app/components/ConfigureLegacyObligation.tsx', import.meta.url),
    'utf8'
  )
  assert.match(configure, /\/repair-center\/obligation-review\?scheduledPaymentId=/)
  assert.match(configure, /Revisar evidencia sin guardar/)
})
