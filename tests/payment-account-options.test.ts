import assert from 'node:assert/strict'
import test from 'node:test'

import { paymentAccountOptions, strongPaymentAccountSuggestion } from '../lib/financial-engine/payment-account-options.ts'

test('payment selector includes only active visible spendable depository and cash accounts', () => {
  const options = paymentAccountOptions([
    { id: 'plaid-ok', name: 'Cuenta Perfecta', institution_name: 'FirstBank', type: 'depository', is_hidden: false, account_status: 'active', is_spendable: true, available_balance: 1439.84 },
    { id: 'retirement', name: 'Retiro', institution_name: 'Investment', type: 'investment', is_hidden: false, account_status: 'active', is_spendable: false },
    { id: 'hidden', name: 'Hidden checking', type: 'depository', is_hidden: true, account_status: 'active', is_spendable: true },
  ], [
    { id: 'manual-ok', name: 'Efectivo', account_type: 'cash', account_status: 'active', is_hidden: false, is_spendable: true, balance: 100 },
    { id: 'archived', name: 'Old bank', account_type: 'checking', account_status: 'archived', is_spendable: true },
  ])

  assert.deepEqual(options.map((option) => option.id), ['plaid-ok', 'manual-ok'])
  assert.equal(options[0].usableBalance, 1439.84)
})

test('detected transaction account is the strongest deterministic preselection', () => {
  assert.deepEqual(strongPaymentAccountSuggestion({
    detectedAccountId: 'detected', priorAccountIds: ['prior', 'prior'], configuredAccountId: 'configured',
  }), { id: 'detected', reason: 'Esta es la cuenta de la transacción detectada.' })
})

test('repeated prior account is suggested but one occurrence is not enough', () => {
  assert.equal(strongPaymentAccountSuggestion({ priorAccountIds: ['one'] }), null)
  assert.equal(strongPaymentAccountSuggestion({ priorAccountIds: ['a', 'b'] }), null)
  assert.equal(strongPaymentAccountSuggestion({ priorAccountIds: ['same', 'same'] })?.id, 'same')
})
