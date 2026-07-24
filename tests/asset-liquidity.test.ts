import assert from 'node:assert/strict'
import test from 'node:test'
import { connectedAccountIsLiquid, plaidUsableBalance } from '../lib/financial-engine/asset-liquidity-policy.ts'
import type { ResolvedConnectedAccount } from '../lib/financial-engine/types.ts'

function account(overrides: Partial<ResolvedConnectedAccount>): ResolvedConnectedAccount {
  return { sourceAccounts: [], merged: false, duplicates: [], ...overrides }
}

test('retirement assets remain assets but are not usable cash by default', () => {
  const retirement = account({ type: 'investment', subtype: '401k', current_balance: 116719.56, available_balance: 116719.56, is_spendable: false })
  assert.equal(connectedAccountIsLiquid(retirement), false)
  assert.equal(plaidUsableBalance(retirement), null)
})

test('investment liquidity requires explicit spendability', () => {
  const investment = account({ type: 'investment', subtype: 'brokerage', current_balance: 5000, available_balance: 1200, is_spendable: true })
  assert.equal(connectedAccountIsLiquid(investment), true)
  assert.equal(plaidUsableBalance(investment), 1200)
})

test('connected checking remains usable cash without investment opt-in', () => {
  const checking = account({ type: 'depository', subtype: 'checking', current_balance: 2000, available_balance: 1800, is_spendable: false })
  assert.equal(connectedAccountIsLiquid(checking), true)
  assert.equal(plaidUsableBalance(checking), 1800)
})
