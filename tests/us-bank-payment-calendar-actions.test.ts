import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { paymentCalendarActions } from '../lib/financial-engine/payment-calendar-actions.ts'

const schedule = readFileSync(new URL('../app/components/PaymentScheduleView.tsx', import.meta.url), 'utf8')
const drawer = readFileSync(new URL('../app/components/FinancialObligationDrawer.tsx', import.meta.url), 'utf8')
const robototina = readFileSync(new URL('../app/robototina/page.tsx', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('../app/timeline/page.tsx', import.meta.url), 'utf8')

test('U.S. Bank possible-match calendar card exposes edit and Robototina review paths', () => {
  const actions = paymentCalendarActions({
    id: 'us-bank-july-2026',
    name: 'U.S. Bank',
    amount: 46,
    truthStatus: 'possible_match',
    obligationInstanceId: 'us-bank-instance',
    lifecycleMatchedTransaction: {
      id: 'candidate-46',
      amount: 46,
      date: '2026-07-15',
      name: 'Internet Payment Thank You',
      confidence: 65,
      confidenceLevel: 'low',
      source: 'plaid_import',
    },
  })

  assert.equal(actions.canEditReportedPayment, true)
  assert.equal(actions.editPaymentHref, '/timeline?obligationId=us-bank-instance&action=edit-payment#payments')
  assert.notEqual(actions.editPaymentHref, '/timeline#payments')
  assert.equal(actions.reviewMatchHref, '/robototina#recommended-next-moves')
  assert.match(schedule, /Editar pago reportado/)
  assert.match(schedule, /Revisar coincidencia/)
  assert.match(schedule, /onClick=\{onOpen\}/)
  assert.match(schedule, /payment\.obligationInstanceId === initialObligationId/)
  assert.match(schedule, /useState<PaymentInstance \| null>\(\(\) =>/)
  assert.match(timeline, /query\.action === 'edit-payment' \? query\.obligationId/)
  assert.match(timeline, /initialObligationId=/)
  assert.match(timeline, /key=\{query\.action === 'edit-payment'/)
})

test('editing does not accept the candidate and rejection remains in the obligation editor', () => {
  assert.doesNotMatch(schedule, /reconciliation-candidate/)
  assert.match(drawer, /No corresponde a este pago/)
  assert.match(drawer, /decideCandidate\(String\(candidate.id\), 'reject'\)/)
  assert.match(robototina, /id="recommended-next-moves"/)
})
