import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildTimelineProjectionFromLiquidity } from '../lib/financial-engine/timeline.ts'

const emptyIncome = {
  allIncome: [],
  expectedIncome: [],
  receivedIncome: [],
  missedIncome: [],
  cancelledIncome: [],
  projectedIncome: [],
  totalProjectedIncome: 0,
}

function lifecycle({ julyStatus }: { julyStatus?: string } = {}) {
  return [
    ...(julyStatus ? [{
        id: 'phones-july',
        scheduled_payment_id: 'phones',
        payment_month: 7,
        payment_year: 2026,
        name: 'Servicio Móvil',
        amount: 100,
        effective_due_date: '2026-07-15',
        due_date: '2026-07-15',
        status: julyStatus,
        owner: 'household',
      }] : []),
    {
      id: 'scheduled:phones:2026-8',
      scheduled_payment_id: 'phones',
      payment_month: 8,
      payment_year: 2026,
      name: 'Servicio Móvil',
      amount: 100,
      effective_due_date: '2026-08-15',
      due_date: '2026-08-15',
      status: 'pending',
      owner: 'household',
    },
  ]
}

test('a monthly schedule creates its next cycle without database writes', () => {
  const source = readFileSync(
    new URL('../lib/financial-engine/liquidity.ts', import.meta.url),
    'utf8'
  )
  assert.match(source, /enumerateRecurringCycles\(/)
  assert.match(source, /horizonEnd/)
  assert.doesNotMatch(source, /const nextExpectedPayments/)
  assert.match(source, /expectedScheduledPayment\(/)
  assert.doesNotMatch(source, /\.from\('payment_instances'\)\.(insert|upsert)/)
})

test('an unpaid July cycle does not hide the August cycle', () => {
  const source = readFileSync(
    new URL('../lib/financial-engine/liquidity.ts', import.meta.url),
    'utf8'
  )
  assert.doesNotMatch(source, /earliestOpenCyclePerSchedule/)
  assert.match(source, /return sortedPayments/)
})

test('paying July does not remove August and paid July is not projected again', () => {
  const payments = lifecycle({ julyStatus: 'paid' })
  const projection = buildTimelineProjectionFromLiquidity({
    cashAvailableTotal: 1000,
    cashAvailablePlaid: 1000,
    cashAvailableManual: 0,
    income: emptyIncome,
    lifecyclePayments: payments,
  }, { today: '2026-07-29', horizonDays: 45 })

  assert.ok(payments.some((payment) => payment.payment_month === 8))
  assert.equal(
    projection.events.some((event) => event.id === 'phones-july'),
    false
  )
  assert.ok(
    projection.events.some((event) => event.id === 'scheduled:phones:2026-8')
  )
})

test('a household obligation remains visible inside the 45-day horizon', () => {
  const payments = lifecycle({ julyStatus: 'paid' })
  const august = payments.find((payment) => payment.payment_month === 8)
  assert.equal(august?.owner, 'household')

  const projection = buildTimelineProjectionFromLiquidity({
    cashAvailableTotal: 1000,
    cashAvailablePlaid: 1000,
    cashAvailableManual: 0,
    income: emptyIncome,
    lifecyclePayments: payments,
  }, { today: '2026-07-29', horizonDays: 45 })

  assert.equal(projection.horizonEnd, '2026-09-12')
  assert.ok(projection.trustedPayments.some((payment) => payment.id === august?.id))
})

test('Dashboard and Timeline consume the same household lifecycle payments', () => {
  const payments = lifecycle({ julyStatus: 'paid' })
  const liquidity = {
    cashAvailableTotal: 1000,
    cashAvailablePlaid: 1000,
    cashAvailableManual: 0,
    income: emptyIncome,
    lifecyclePayments: payments,
  }
  const timeline = buildTimelineProjectionFromLiquidity(liquidity, {
    today: '2026-07-29',
    horizonDays: 45,
  })

  const dashboardSource = readFileSync(
    new URL('../lib/financial-engine/dashboard.ts', import.meta.url),
    'utf8'
  )
  assert.match(dashboardSource, /liquidity,\s*planning/)
  assert.deepEqual(payments.map((payment) => payment.id), timeline.trustedPayments.map((payment) => payment.id))
})

test('an active monthly schedule remains present after its previous cycle closes', () => {
  const payments = lifecycle({ julyStatus: 'paid' })
  assert.ok(payments.some((payment) =>
    payment.scheduled_payment_id === 'phones' &&
    payment.payment_month === 8 &&
    payment.status === 'pending'
  ))
})
