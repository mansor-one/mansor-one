import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { obligationPaymentEditState } from '../lib/financial-engine/obligation-payment-edit-state.ts'

const drawer = readFileSync(new URL('../app/components/FinancialObligationDrawer.tsx', import.meta.url), 'utf8')
const form = readFileSync(new URL('../app/components/ConfirmObligationPaid.tsx', import.meta.url), 'utf8')

test('U.S. Bank possible match is editable without accepting the $46 candidate', () => {
  const state = obligationPaymentEditState({
    instance: {
      status: 'pending',
      amount_expected: 46,
      updated_at: '2026-07-15T12:00:00.000Z',
    },
    obligation: { payment_method: 'Banco Popular e-account' },
    paymentLinks: [{
      reconciliation_status: 'detected',
      plaid_import_id: 'internet-payment-46',
      reported_amount: null,
    }],
  })

  assert.equal(state.candidateState, 'possible_match')
  assert.equal(state.settlementState, null)
  assert.equal(state.canEditReportedPayment, true)
  assert.equal(state.submissionMethod, 'POST')
  assert.equal(state.reportedPayment?.reportedAmount, 46)
  assert.equal(state.reportedPayment?.confirmedAt, '2026-07-15T12:00:00.000Z')
})

test('an initiated payment remains pending settlement while a candidate is under review', () => {
  const state = obligationPaymentEditState({
    instance: { status: 'initiated', amount_expected: 359, updated_at: '2026-07-13T12:00:00.000Z' },
    obligation: { payment_method: 'Banco Popular e-account' },
    paymentLinks: [{ reconciliation_status: 'detected', plaid_import_id: 'internet-payment-46' }],
  })

  assert.equal(state.candidateState, 'possible_match')
  assert.equal(state.settlementState, 'pending_settlement')
  assert.equal(state.canEditReportedPayment, true)
})

test('editing and rejecting remain separate user decisions in the drawer', () => {
  assert.match(drawer, /canEditReportedPayment/)
  assert.match(drawer, /No corresponde a este pago/)
  assert.match(drawer, /decideCandidate\(String\(candidate.id\), 'reject'\)/)
  assert.match(form, /submissionMethod \|\| \(existingPayment \? 'PATCH' : 'POST'\)/)
  assert.doesNotMatch(form, /reconciliation-candidate/)
})
