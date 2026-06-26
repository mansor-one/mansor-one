import { getResolvedAccounts } from './account-resolver'
import { getManualAccounts } from './accounts'
import type {
  FinancialAsset,
  FinancialSupabaseClient,
  ManualAccount,
  ResolvedConnectedAccount,
} from './types'

function numberValue(value: number | null | undefined) {
  return Number(value || 0)
}

function plaidAsset(account: ResolvedConnectedAccount): FinancialAsset {
  return {
    id: `plaid:${account.plaid_account_id || account.id || 'unknown'}`,
    source: 'plaid',
    sourceId: account.plaid_account_id || null,
    institution: account.institution_name || null,
    name: account.name || null,
    type: account.type || null,
    subtype: account.subtype || null,
    balance: numberValue(account.current_balance),
    availableBalance: numberValue(account.available_balance),
    currency: account.currency || null,
    isLiquid: ['depository', 'cash'].includes(account.type || ''),
    isCredit: account.type === 'credit',
    isManual: false,
    isConnected: true,
    metadata: {
      accountId: account.id || null,
      connectionId: account.connection_id || null,
      updatedAt: account.updated_at || null,
      merged: account.merged,
      duplicates: account.duplicates,
      sourceAccounts: account.sourceAccounts,
    },
  }
}

function manualAsset(account: ManualAccount): FinancialAsset {
  return {
    id: `manual:${account.id || 'unknown'}`,
    source: 'manual',
    sourceId: account.id || null,
    institution: null,
    name: account.name || null,
    type: account.account_type || null,
    subtype: null,
    balance: numberValue(account.balance),
    availableBalance: numberValue(account.balance),
    currency: account.currency || null,
    isLiquid: account.is_spendable === true,
    isCredit: false,
    isManual: true,
    isConnected: false,
    metadata: {
      isActive: account.is_active ?? null,
      isSpendable: account.is_spendable ?? null,
    },
  }
}

export async function getConnectedAssets(
  supabase: FinancialSupabaseClient,
  userId: string
) {
  const { resolvedAccounts } = await getResolvedAccounts(supabase, userId)
  return resolvedAccounts.map(plaidAsset)
}

export async function getManualAssets(
  supabase: FinancialSupabaseClient,
  userId: string
) {
  const accounts = await getManualAccounts(supabase, userId)
  return accounts.map(manualAsset)
}

export async function getAssets(
  supabase: FinancialSupabaseClient,
  userId: string
) {
  const [connectedAssets, manualAssets] = await Promise.all([
    getConnectedAssets(supabase, userId),
    getManualAssets(supabase, userId),
  ])

  return [...connectedAssets, ...manualAssets]
}

export async function getLiquidAssets(
  supabase: FinancialSupabaseClient,
  userId: string
) {
  const assets = await getAssets(supabase, userId)
  return assets.filter((asset) => asset.isLiquid)
}

export async function getCreditAssets(
  supabase: FinancialSupabaseClient,
  userId: string
) {
  const assets = await getAssets(supabase, userId)
  return assets.filter((asset) => asset.isCredit)
}
