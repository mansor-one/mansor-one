import {
  getAssets,
  getConnectedAssets,
  getCreditAssets,
  getLiquidAssets,
  getManualAssets,
} from './assets'
import type {
  FinancialAsset,
  FinancialSupabaseClient,
  PortfolioSummary,
} from './types'

function sumAssets(
  assets: FinancialAsset[],
  getValue: (asset: FinancialAsset) => number
) {
  return assets.reduce((sum, asset) => sum + getValue(asset), 0)
}

export async function getPortfolioSummary(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<PortfolioSummary> {
  const [assets, liquidAssets, creditAssets, connectedAssets, manualAssets] =
    await Promise.all([
      getAssets(supabase, userId),
      getLiquidAssets(supabase, userId),
      getCreditAssets(supabase, userId),
      getConnectedAssets(supabase, userId),
      getManualAssets(supabase, userId),
    ])

  const totalAssetBalance = sumAssets(
    assets.filter((asset) => !asset.isCredit),
    (asset) => asset.balance
  )

  const totalLiquidAvailable = sumAssets(
    liquidAssets,
    (asset) => asset.availableBalance
  )

  const totalConnectedLiquidAvailable = sumAssets(
    liquidAssets.filter((asset) => asset.isConnected),
    (asset) => asset.availableBalance
  )

  const totalManualLiquidAvailable = sumAssets(
    liquidAssets.filter((asset) => asset.isManual),
    (asset) => asset.availableBalance
  )

  const totalCreditDebt = sumAssets(creditAssets, (asset) => asset.balance)
  const totalCreditAvailable = sumAssets(
    creditAssets,
    (asset) => asset.availableBalance
  )
  const totalCreditLimit = totalCreditDebt + totalCreditAvailable

  return {
    assets,
    liquidAssets,
    creditAssets,
    connectedAssets,
    manualAssets,
    totalAssetBalance,
    totalLiquidAvailable,
    totalConnectedLiquidAvailable,
    totalManualLiquidAvailable,
    totalCreditDebt,
    totalCreditAvailable,
    totalConnectedAssets: connectedAssets.length,
    totalManualAssets: manualAssets.length,
    totalAssets: assets.length,
    totalCreditAssets: creditAssets.length,
    totalLiquidAssets: liquidAssets.length,
    netWorth: totalAssetBalance - totalCreditDebt,
    creditUtilizationPercent:
      totalCreditLimit > 0 ? (totalCreditDebt / totalCreditLimit) * 100 : 0,
  }
}
