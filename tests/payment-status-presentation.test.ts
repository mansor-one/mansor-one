import assert from 'node:assert/strict'
import test from 'node:test'
import { paymentStatusPresentation } from '../lib/financial-engine/payment-status-presentation.ts'

const today = '2026-07-20'

test('presents overdue, grace and due-soon obligations with distinct accessible semantics', () => {
  const sunRun = paymentStatusPresentation({ status: 'overdue', amount: 100, dueDate: '2026-07-18', today })
  const toyota = paymentStatusPresentation({ status: 'grace_period', amount: 500, dueDate: '2026-07-18', graceDate: '2026-08-02', today })
  const agua = paymentStatusPresentation({ status: 'due_soon', amount: 45, dueDate: '2026-07-22', today })

  assert.equal(sunRun.tone, 'overdue')
  assert.match(sunRun.classes, /red/)
  assert.equal(sunRun.relativeLabel, 'Vencido hace 2 días')
  assert.match(toyota.classes, /orange/)
  assert.equal(toyota.relativeLabel, 'Quedan 13 días de gracia')
  assert.match(agua.classes, /amber/)
  assert.equal(agua.relativeLabel, 'Vence en 2 días')
  assert.ok(sunRun.icon && toyota.icon && agua.icon)
})

test('shows possible-match confidence without overstating weaker candidates', () => {
  const popular = paymentStatusPresentation({ status: 'possible_match', amount: 80, confidence: 92, today })
  const usBank = paymentStatusPresentation({ status: 'possible_match', amount: 90, confidence: 75, today })
  const weak = paymentStatusPresentation({ status: 'possible_match', amount: 90, confidence: 65, today })

  assert.equal(popular.confidenceStrength, 'alta')
  assert.match(popular.classes, /blue-400/)
  assert.equal(usBank.confidenceStrength, 'moderada')
  assert.match(usBank.classes, /sky/)
  assert.equal(weak.confidenceStrength, 'requiere revisión')
  assert.match(weak.classes, /amber/)
})

test('presents settlement, early payment, reconciliation and invalid amount correctly', () => {
  const pending = paymentStatusPresentation({ status: 'in_transit', amount: 100, dueDate: '2026-07-18', evidenceDate: '2026-07-19', today })
  const early = paymentStatusPresentation({ status: 'in_transit', amount: 100, dueDate: '2026-07-25', evidenceDate: '2026-07-19', today })
  const reconciled = paymentStatusPresentation({ status: 'reconciled', amount: 100, reconciledDate: '2026-07-03', today })
  const chase = paymentStatusPresentation({ status: 'due_soon', amount: 0, dueDate: '2026-07-22', today })

  assert.match(pending.classes, /cyan/)
  assert.equal(pending.relativeLabel, 'Pago reportado hace 1 día')
  assert.equal(early.label, 'Pago anticipado reportado')
  assert.match(reconciled.classes, /emerald/)
  assert.equal(reconciled.relativeLabel, 'Conciliado el 3 de julio')
  assert.equal(chase.tone, 'invalid')
  assert.match(chase.classes, /violet/)
  assert.match(chase.explanation, /no participa en totales ni proyecciones/)
})
