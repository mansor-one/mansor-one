import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildObligationConfigurationReport } from '../lib/financial-engine/obligation-configuration.ts'
import {
  addCalendarDays,
  contractualDueDate,
  dateInTimeZone,
  enumerateRecurringCycles,
  recurrenceAnchorDate,
  withRecurrenceAnchorMarker,
} from '../lib/financial-engine/recurring-cycle-enumerator.ts'

function monthly(overrides: Record<string, unknown> = {}) {
  return {
    id: 'legacy-monthly',
    amount: 100,
    due_day: 5,
    recurrence_type: 'monthly',
    is_active: true,
    ...overrides,
  }
}

function biweekly(anchorDate: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'biweekly-schedule',
    amount: 40,
    recurrence_type: 'biweekly',
    start_date: anchorDate,
    is_active: true,
    ...overrides,
  }
}

test('29 July 2026 plus 45 calendar days ends inclusively on 12 September', () => {
  assert.equal(addCalendarDays('2026-07-29', 45), '2026-09-12')
})

test('the household timezone owns the evaluation date near a UTC boundary', () => {
  assert.equal(
    dateInTimeZone(
      new Date('2026-07-30T02:30:00.000Z'),
      'America/Puerto_Rico'
    ),
    '2026-07-29'
  )
})

test('the mobile horizon includes September 5 but excludes September 13', () => {
  const fifth = enumerateRecurringCycles({
    source: monthly({ due_day: 5 }),
    startDate: '2026-07-29',
    horizonEnd: '2026-09-12',
  })
  const thirteenth = enumerateRecurringCycles({
    source: monthly({ due_day: 13 }),
    startDate: '2026-07-29',
    horizonEnd: '2026-09-12',
  })

  assert.ok(fifth.some((cycle) => cycle.dueDate === '2026-09-05'))
  assert.equal(thirteenth.some((cycle) => cycle.dueDate === '2026-09-13'), false)
})

test('the horizon final date is inclusive', () => {
  const cycles = enumerateRecurringCycles({
    source: monthly({ due_day: 12 }),
    startDate: '2026-07-29',
    horizonEnd: '2026-09-12',
  })
  assert.ok(cycles.some((cycle) => cycle.dueDate === '2026-09-12'))
})

test('enumeration crosses December into January without a month-count limit', () => {
  const cycles = enumerateRecurringCycles({
    source: monthly({ due_day: 10 }),
    startDate: '2026-12-20',
    horizonEnd: '2027-02-10',
  })
  assert.deepEqual(cycles.map((cycle) => cycle.dueDate), [
    '2027-01-10',
    '2027-02-10',
  ])
})

test('contractual days 29, 30 and 31 clamp to the month final day', () => {
  assert.equal(contractualDueDate(2027, 2, 29), '2027-02-28')
  assert.equal(contractualDueDate(2028, 2, 30), '2028-02-29')
  assert.equal(contractualDueDate(2026, 4, 31), '2026-04-30')
  assert.equal(contractualDueDate(2026, 7, 31), '2026-07-31')
})

test('inactive and ended obligations generate no future cycles', () => {
  assert.deepEqual(enumerateRecurringCycles({
    source: monthly({ is_active: false }),
    startDate: '2026-07-29',
    horizonEnd: '2026-09-12',
  }), [])
  assert.deepEqual(enumerateRecurringCycles({
    source: monthly({ end_date: '2026-07-28' }),
    startDate: '2026-07-29',
    horizonEnd: '2026-09-12',
  }), [])
})

test('existing cycles are not duplicated and a paid cycle is not revived', () => {
  const existingCycles = [{ year: 2026, month: 8 }]
  const cycles = enumerateRecurringCycles({
    source: monthly(),
    startDate: '2026-07-29',
    horizonEnd: '2026-09-12',
    existingCycles,
  })

  assert.equal(cycles.some((cycle) => cycle.month === 8), false)
  assert.ok(cycles.some((cycle) => cycle.month === 9))
})

test('biweekly means an exact 14-day cadence from a full anchor date', () => {
  const cycles = enumerateRecurringCycles({
    source: biweekly('2026-01-02'),
    startDate: '2026-01-01',
    horizonEnd: '2026-02-28',
  })

  assert.deepEqual(cycles.map((cycle) => cycle.dueDate), [
    '2026-01-02', '2026-01-16', '2026-01-30',
    '2026-02-13', '2026-02-27',
  ])
})

test('biweekly supports both two and three occurrences in one month', () => {
  const january = enumerateRecurringCycles({
    source: biweekly('2026-01-02'),
    startDate: '2026-01-01',
    horizonEnd: '2026-01-31',
  })
  const february = enumerateRecurringCycles({
    source: biweekly('2026-02-06'),
    startDate: '2026-02-01',
    horizonEnd: '2026-02-28',
  })

  assert.equal(january.length, 3)
  assert.equal(february.length, 2)
})

test('biweekly crosses years and February without month arithmetic', () => {
  const cycles = enumerateRecurringCycles({
    source: biweekly('2026-12-18'),
    startDate: '2026-12-18',
    horizonEnd: '2027-02-28',
  })

  assert.deepEqual(cycles.map((cycle) => cycle.dueDate), [
    '2026-12-18', '2027-01-01', '2027-01-15', '2027-01-29',
    '2027-02-12', '2027-02-26',
  ])
})

test('biweekly deduplicates only the exact expected date', () => {
  const cycles = enumerateRecurringCycles({
    source: biweekly('2026-01-02'),
    startDate: '2026-01-01',
    horizonEnd: '2026-01-31',
    existingCycles: [{ dueDate: '2026-01-16' }],
  })

  assert.deepEqual(cycles.map((cycle) => cycle.dueDate), [
    '2026-01-02', '2026-01-30',
  ])
})

test('the anchor marker is validated, replaceable and preserves unrelated legacy notes', () => {
  const notes = withRecurrenceAnchorMarker(
    'migrated_from:legacy | anchor_date:2026-01-02',
    '2026-02-06'
  )
  assert.equal(notes, 'migrated_from:legacy | anchor_date:2026-02-06')
  assert.equal(recurrenceAnchorDate({ id: 'legacy', custom_schedule_notes: notes }), '2026-02-06')
  assert.throws(() => withRecurrenceAnchorMarker(null, '2026-02-31'))
})

test('monthly, quarterly, annual and custom month cadences remain unchanged', () => {
  const dates = (recurrence_type: string, recurrence_interval?: number) =>
    enumerateRecurringCycles({
      source: monthly({ recurrence_type, recurrence_interval }),
      startDate: '2026-01-01',
      horizonEnd: '2027-01-05',
    }).map((cycle) => cycle.dueDate)

  assert.equal(dates('monthly').length, 13)
  assert.deepEqual(dates('quarterly'), ['2026-01-05', '2026-04-05', '2026-07-05', '2026-10-05', '2027-01-05'])
  assert.deepEqual(dates('annual'), ['2026-01-05', '2027-01-05'])
  assert.deepEqual(dates('custom', 2), ['2026-01-05', '2026-03-05', '2026-05-05', '2026-07-05', '2026-09-05', '2026-11-05', '2027-01-05'])
})

test('an existing open July cycle does not hide a generated August cycle', () => {
  const generated = enumerateRecurringCycles({
    source: monthly({ due_day: 31 }),
    startDate: '2026-07-29',
    horizonEnd: '2026-09-12',
    existingCycles: [{ year: 2026, month: 7 }],
  })
  const combined = ['2026-07-31', ...generated.map((cycle) => cycle.dueDate)]

  assert.ok(combined.includes('2026-07-31'))
  assert.ok(combined.includes('2026-08-31'))
})

test('a missing due day remains excluded and visible in Needs Configuration', () => {
  const source = monthly({ due_day: null })
  assert.deepEqual(enumerateRecurringCycles({
    source,
    startDate: '2026-07-29',
    horizonEnd: '2026-09-12',
  }), [])

  const report = buildObligationConfigurationReport({
    obligations: [],
    scheduledPayments: [{
      id: source.id,
      name: 'Servicio Móvil',
      household_id: 'household-1',
      amount: 100,
      due_day: null,
      owner: 'household',
      recurrence_type: 'monthly',
      is_active: true,
    }],
  })
  assert.ok(report.needsConfiguration[0].issues.some((issue) => issue.code === 'due_day'))
})

test('Dashboard and Timeline obtain the same lifecycle occurrences from Liquidity', () => {
  const dashboard = readFileSync(
    new URL('../lib/financial-engine/dashboard.ts', import.meta.url),
    'utf8'
  )
  const timeline = readFileSync(
    new URL('../lib/financial-engine/timeline.ts', import.meta.url),
    'utf8'
  )

  assert.match(dashboard, /getLiquiditySummary\(supabase, userId\)/)
  assert.match(timeline, /getLiquiditySummary\([\s\S]*normalizedOptions/)
  assert.match(timeline, /buildTimelineProjectionFromLiquidity\(liquidity, normalizedOptions\)/)
})
