import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  futureDefaultAmountUpdate,
  paymentCorrectionAuditEvidence,
} from '../lib/financial-engine/obligation-payment-correction.ts'

const confirmationRoute = readFileSync(
  new URL('../app/api/obligations/confirm-paid/route.ts', import.meta.url),
  'utf8'
)
const migration = readFileSync(
  new URL('../migrations/20260721_obligation_payment_corrections.sql', import.meta.url),
  'utf8'
)

test('pending-settlement correction records previous and corrected values safely', () => {
  const evidence = paymentCorrectionAuditEvidence({
    previous: {
      reportedAmount: 46,
      confirmationDate: '2026-07-15',
      paymentMethod: 'Banco Popular',
      paymentAccountId: 'old-account-id',
      paymentAccountSource: 'plaid_account',
      notePresent: false,
    },
    corrected: {
      reportedAmount: 359,
      confirmationDate: '2026-07-13',
      paymentMethod: 'Banco Popular e-account',
      paymentAccountId: 'correct-account-id',
      paymentAccountSource: 'plaid_account',
      notePresent: true,
    },
    futureDefault: { previous: 46, corrected: 359 },
  })

  assert.equal(evidence.previous.reported_amount, 46)
  assert.equal(evidence.corrected.reported_amount, 359)
  assert.equal(evidence.corrected.confirmation_date, '2026-07-13')
  assert.equal(evidence.corrected.payment_account_changed, true)
  assert.deepEqual(evidence.future_default, { previous: 46, corrected: 359 })
  assert.equal(JSON.stringify(evidence).includes('old-account-id'), false)
  assert.equal(JSON.stringify(evidence).includes('correct-account-id'), false)
})

test('future default update does not rewrite historical obligation cycles', () => {
  const obligation = { id: 'us-bank', default_amount: 46 }
  const historicalCycles = [
    { id: 'june', amount_expected: 46 },
    { id: 'july', amount_expected: 359 },
  ]
  const originalHistory = structuredClone(historicalCycles)

  const updatedObligation = {
    ...obligation,
    ...futureDefaultAmountUpdate(359),
  }

  assert.equal(updatedObligation.default_amount, 359)
  assert.deepEqual(historicalCycles, originalHistory)
})

test('pending correction route persists reported amount and an audit event', () => {
  assert.match(confirmationRoute, /export async function PATCH/)
  assert.match(confirmationRoute, /reported_amount: reportedAmount/)
  assert.match(confirmationRoute, /event_type: 'manual_correction'/)
  assert.match(migration, /add column if not exists reported_amount numeric/)
  assert.match(migration, /'manual_correction'/)
})

test('future default option updates obligations without updating historical instance amounts', () => {
  assert.match(confirmationRoute, /from\('obligations'\)\.update/)
  assert.doesNotMatch(
    confirmationRoute,
    /from\('obligation_instances'\)\.update\(\{[\s\S]*?amount_expected/
  )
})
