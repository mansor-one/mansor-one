import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildObligationConfigurationReport } from '../lib/financial-engine/obligation-configuration.ts'

const householdId = 'household-a'

test('detects incomplete canonical and legacy obligations with actionable reasons', () => {
  const report = buildObligationConfigurationReport({
    obligations: [{
      id: 'example-loan', name: 'Préstamo Ejemplo', household_id: householdId,
      default_amount: 100, due_day: null, owner: 'household',
      frequency: 'monthly', payment_method: null, is_active: true,
    }],
    scheduledPayments: [{
      id: 'mobile-service', name: 'Servicio Móvil', household_id: householdId,
      amount: 100, due_day: null, owner: 'household', recurrence_type: 'monthly',
      recurrence_interval: 1, is_active: true,
    }],
  })

  const loan = report.needsConfiguration.find((item) => item.id === 'example-loan')
  const mobileService = report.needsConfiguration.find((item) => item.id === 'mobile-service')
  assert.deepEqual(loan?.issues.map((item) => item.code), ['instances', 'due_day', 'payment_account'])
  assert.deepEqual(mobileService?.issues.map((item) => item.code), ['due_day'])
  assert.equal(mobileService?.owner, 'household')
})

test('missing owner, recurrence and amount are detected independently', () => {
  const report = buildObligationConfigurationReport({
    obligations: [],
    scheduledPayments: [{
      id: 'incomplete', name: 'Incomplete', household_id: householdId,
      amount: null, due_day: 15, owner: null, recurrence_type: null,
      recurrence_interval: null, is_active: true,
    }],
  })
  assert.deepEqual(
    new Set(report.needsConfiguration[0].issues.map((item) => item.code)),
    new Set(['amount', 'owner', 'recurrence'])
  )
})

test('complete and inactive rows do not appear in Needs Configuration', () => {
  const report = buildObligationConfigurationReport({
    obligations: [{
      id: 'complete', name: 'Complete', household_id: householdId,
      default_amount: 100, due_day: 10, owner: 'household',
      frequency: 'monthly', payment_method: 'Cuenta Familiar', is_active: true,
    }],
    scheduledPayments: [{
      id: 'inactive', name: 'Inactive', household_id: householdId,
      amount: null, due_day: null, owner: null, recurrence_type: null,
      is_active: false,
    }],
    obligationInstances: [{ obligation_id: 'complete', status: 'pending' }],
  })
  assert.equal(report.needsConfiguration.length, 0)
  assert.deepEqual(report.complete.map((item) => item.id), ['complete'])
})

test('a service with an unconfirmed legacy due day remains in Needs Configuration', () => {
  const report = buildObligationConfigurationReport({
    obligations: [{
      id: 'service-canonical', name: 'Servicio Jardín', household_id: householdId,
      default_amount: 35, due_day: 29, owner: 'household',
      frequency: 'monthly', payment_method: 'Cuenta Familiar', is_active: true,
      notes: 'Migrated from scheduled_payments.00000000-0000-4000-8000-000000000001 Servicio Jardín.',
    }],
    scheduledPayments: [{
      id: '00000000-0000-4000-8000-000000000001', name: 'Servicio Jardín',
      household_id: householdId, amount: 30, due_day: null, owner: 'household',
      recurrence_type: 'monthly', recurrence_interval: 1, is_active: true,
    }],
    obligationInstances: [],
  })
  const service = report.needsConfiguration.find((item) => item.id === 'service-canonical')

  assert.deepEqual(
    service?.issues.map((item) => item.code),
    ['due_day_conflict', 'instances']
  )
  assert.equal(service?.requiresDueDayConfirmation, true)
})

test('an annual service 10 versus 15 conflict blocks configuration until explicit confirmation', () => {
  const report = buildObligationConfigurationReport({
    obligations: [{
      id: 'annual-service', name: 'Servicio Anual', household_id: householdId,
      default_amount: 100, due_day: 10, due_date: '2026-07-15', owner: 'household',
      frequency: 'annual', payment_method: 'Cuenta Familiar', is_active: true,
    }],
    scheduledPayments: [],
    planningItems: [{
      id: 'planning-annual-service', name: 'Servicio Anual',
      household_id: householdId, target_amount: 100,
      due_date: '2026-07-15', is_archived: true,
    }],
    obligationInstances: [],
  })
  const annualService = report.needsConfiguration[0]

  assert.equal(annualService.id, 'annual-service')
  assert.deepEqual(
    annualService.issues.map((item) => item.code),
    ['due_day_conflict', 'instances']
  )
  assert.match(annualService.issues[0].explanation, /15.*10/)
})

test('the UI saves only master data and never creates financial movements or payments', () => {
  const route = readFileSync(new URL('../app/api/obligations/configuration/route.ts', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../app/payments/page.tsx', import.meta.url), 'utf8')
  const client = readFileSync(new URL('../app/payments/NeedsConfiguration.tsx', import.meta.url), 'utf8')

  assert.match(page, /NeedsConfiguration/)
  assert.match(client, /Needs Configuration/)
  assert.match(client, /No se crearon pagos/)
  assert.match(route, /requireApiUser/)
  assert.match(route, /requireMutationOrigin/)
  assert.match(route, /household_members/)
  assert.match(route, /\.eq\('household_id', membership\.household_id\)/)
  assert.match(route, /generatedPayments: 0/)
  assert.doesNotMatch(route, /\.from\(['"](?:payment_instances|obligation_instances|quick_entries|plaid_imports)['"]\)\s*\.(?:insert|upsert)/)
})

test('legacy rows already marked as migrated are not offered as duplicate configuration work', () => {
  const report = buildObligationConfigurationReport({
    obligations: [],
    scheduledPayments: [{
      id: 'legacy', name: 'Legacy', household_id: householdId,
      amount: 100, due_day: null, owner: 'household', recurrence_type: 'monthly',
      recurrence_interval: 1, is_active: true,
      notes: 'migrated_to_obligation.123',
    }],
  })
  assert.equal(report.all.length, 0)
})
