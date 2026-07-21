import type { ConnectedAccount, ResolvedConnectedAccount } from './types.ts'

function nullableNumberValue(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function connectedAccountIsLiquid(account: ConnectedAccount) {
  return (
    ['depository', 'cash'].includes(account.type || '') ||
    account.subtype === 'checking' ||
    account.subtype === 'savings' ||
    account.is_spendable === true
  )
}

export function plaidUsableBalance(account: ResolvedConnectedAccount) {
  if (account.type === 'credit') return null
  if (!connectedAccountIsLiquid(account)) return null

  const balance = nullableNumberValue(account.current_balance)
  const availableBalance = nullableNumberValue(account.available_balance)
  if (balance !== null && availableBalance !== null) return Math.min(balance, availableBalance)
  return balance ?? availableBalance ?? null
}
