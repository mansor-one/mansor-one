import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schedule = readFileSync(new URL('../app/components/PaymentScheduleView.tsx', import.meta.url), 'utf8')
const drawer = readFileSync(new URL('../app/components/FinancialObligationDrawer.tsx', import.meta.url), 'utf8')
const nav = readFileSync(new URL('../app/components/PrimaryNav.tsx', import.meta.url), 'utf8')
const queue = readFileSync(new URL('../app/lab/review-queue/ReviewQueueClient.tsx', import.meta.url), 'utf8')
const presentation = readFileSync(new URL('../lib/financial-engine/payment-status-presentation.ts', import.meta.url), 'utf8')

test('calendar obligations open the drawer and closing preserves local calendar state', () => {
  assert.match(schedule, /onOpen=\{\(\) => setSelectedPayment\(payment\)\}/)
  assert.match(schedule, /onClose=\{\(\) => setSelectedPayment\(null\)\}/)
  assert.match(schedule, /initialMonth/)
})

test('drawer exposes Spanish lifecycle and configurable missing information', () => {
  assert.match(presentation, /Pagado, esperando confirmación/)
  assert.match(drawer, /Información pendiente/)
  assert.match(drawer, /No configurado/)
  assert.match(drawer, /Sí, ya pagué esto|Confirmar pago/)
})

test('grace periods render only at their deadline instead of every range day', () => {
  assert.match(schedule, /lifecyclePaymentGraceUntilDate\(payment\)/)
  assert.doesNotMatch(schedule, /paymentIsInGraceWindowOnDate/)
})

test('inactive dark mode control is absent and empty review queue is concise', () => {
  assert.doesNotMatch(nav, /Modo oscuro/)
  assert.match(queue, /Todo está al día/)
  assert.match(queue, /No hay movimientos que requieran tu revisión/)
})
