import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveLegacyGraceSemantics } from '../lib/financial-engine/legacy-grace-semantics.ts'

test('legacy grace_day equal to due_day means a same-day deadline, not that many grace days', () => {
  for (const day of [10, 15, 22, 25]) {
    assert.deepEqual(
      resolveLegacyGraceSemantics({
        year: 2026, month: 7, dueDay: day, legacyGraceDay: day,
      }),
      {
        dueDate: `2026-07-${day}`,
        graceDeadline: `2026-07-${day}`,
        graceDays: 0,
        legacyGraceDay: day,
        interpretation: 'same_day',
      }
    )
  }
})

test('legacy day-of-month deadline is exposed separately from its derived duration', () => {
  const result = resolveLegacyGraceSemantics({
    year: 2026, month: 7, dueDay: 1, legacyGraceDay: 15,
  })
  assert.equal(result.legacyGraceDay, 15)
  assert.equal(result.graceDeadline, '2026-07-15')
  assert.equal(result.graceDays, 14)
  assert.equal(result.interpretation, 'deadline_day_of_month')
})

test('legacy duration compatibility is explicit when grace_day is below due_day', () => {
  const result = resolveLegacyGraceSemantics({
    year: 2026, month: 7, dueDay: 25, legacyGraceDay: 15,
  })
  assert.equal(result.legacyGraceDay, 15)
  assert.equal(result.graceDeadline, '2026-08-09')
  assert.equal(result.graceDays, 15)
  assert.equal(result.interpretation, 'duration_days')
})
