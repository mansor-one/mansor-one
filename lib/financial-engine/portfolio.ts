import {
  getAssets,
  getConnectedAssets,
  getCreditAssets,
  getLiquidAssets,
  getManualAssets,
} from './assets'
import { getCreditCards } from './accounts'
import type {
  CreditCard,
  FinancialAsset,
  FinancialSupabaseClient,
  PortfolioAllocationItem,
  PortfolioInstitutionBreakdown,
  PortfolioLiability,
  PortfolioSummary,
} from './types'

function sumAssets(
  assets: FinancialAsset[],
  getValue: (asset: FinancialAsset) => number
) {
  return assets.reduce((sum, asset) => sum + getValue(asset), 0)
}

function numberValue(value: number | null | undefined) {
  return Number(value || 0)
}

function manualCreditCardLiability(card: CreditCard): PortfolioLiability {
  return {
    id: `manual:credit_card:${card.id || 'unknown'}`,
    source: 'manual',
    sourceId: card.id || null,
    name: card.name || null,
    institution: card.bank || null,
    liabilityType: 'credit_card',
    balance: numberValue(card.balance),
    minimumPayment:
      card.minimum_payment === null || card.minimum_payment === undefined
        ? null
        : Number(card.minimum_payment),
    dueDay:
      card.due_day === null || card.due_day === undefined
        ? null
        : Number(card.due_day),
    apr: card.apr ?? null,
    currency: card.currency || null,
    isManual: true,
    isConnected: false,
    metadata: {
      isActive: card.is_active ?? null,
    },
  }
}

function connectedCreditLiability(asset: FinancialAsset): PortfolioLiability {
  return {
    id: `plaid:credit_card:${asset.sourceId || asset.id}`,
    source: 'plaid',
    sourceId: asset.sourceId,
    name: asset.name,
    institution: asset.institution,
    liabilityType: 'credit_card',
    balance: asset.balance,
    minimumPayment: null,
    dueDay: null,
    apr: null,
    currency: asset.currency,
    isManual: false,
    isConnected: true,
    metadata: {
      assetId: asset.id,
      ...asset.metadata,
    },
  }
}

function sumLiabilities(
  liabilities: PortfolioLiability[],
  getValue: (liability: PortfolioLiability) => number
) {
  return liabilities.reduce((sum, liability) => sum + getValue(liability), 0)
}

function sortInstitutionBreakdowns(
  breakdowns: PortfolioInstitutionBreakdown[],
  getValue: (breakdown: PortfolioInstitutionBreakdown) => number
) {
  return [...breakdowns].sort((a, b) => getValue(b) - getValue(a))
}

function institutionBreakdownsFromAssets(
  assets: FinancialAsset[],
  getInstitution: (asset: FinancialAsset) => string,
  sortBy: 'balance' | 'available' = 'balance'
): PortfolioInstitutionBreakdown[] {
  const groups = new Map<string, PortfolioInstitutionBreakdown>()

  assets.forEach((asset) => {
    const institution = getInstitution(asset)
    const current = groups.get(institution) || {
      institution,
      totalBalance: 0,
      totalAvailable: 0,
      count: 0,
    }

    groups.set(institution, {
      institution,
      totalBalance: current.totalBalance + asset.balance,
      totalAvailable: current.totalAvailable + asset.availableBalance,
      count: current.count + 1,
    })
  })

  return sortInstitutionBreakdowns([...groups.values()], (breakdown) =>
    sortBy === 'available'
      ? breakdown.totalAvailable
      : breakdown.totalBalance
  )
}

function institutionBreakdownsFromLiabilities(
  liabilities: PortfolioLiability[],
  getInstitution: (liability: PortfolioLiability) => string
): PortfolioInstitutionBreakdown[] {
  const groups = new Map<string, PortfolioInstitutionBreakdown>()

  liabilities.forEach((liability) => {
    const institution = getInstitution(liability)
    const current = groups.get(institution) || {
      institution,
      totalBalance: 0,
      totalAvailable: 0,
      count: 0,
    }

    groups.set(institution, {
      institution,
      totalBalance: current.totalBalance + liability.balance,
      totalAvailable: current.totalAvailable,
      count: current.count + 1,
    })
  })

  return sortInstitutionBreakdowns(
    [...groups.values()],
    (breakdown) => breakdown.totalBalance
  )
}

function allocationItems(
  values: Array<{ label: string; value: number }>,
  total: number
): PortfolioAllocationItem[] {
  const groups = new Map<string, number>()

  values.forEach((item) => {
    groups.set(item.label, (groups.get(item.label) || 0) + item.value)
  })

  return [...groups.entries()]
    .map(([label, value]) => ({
      label,
      value,
      percent: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
}

export async function getPortfolioSummary(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<PortfolioSummary> {
  const [
    assets,
    liquidAssets,
    creditAssets,
    connectedAssets,
    manualAssets,
    creditCards,
  ] =
    await Promise.all([
      getAssets(supabase, userId),
      getLiquidAssets(supabase, userId),
      getCreditAssets(supabase, userId),
      getConnectedAssets(supabase, userId),
      getManualAssets(supabase, userId),
      getCreditCards(supabase, userId),
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

  const connectedLiabilities = creditAssets.map(connectedCreditLiability)
  const manualLiabilities = creditCards.map(manualCreditCardLiability)
  const liabilities = [...connectedLiabilities, ...manualLiabilities]

  const connectedCreditDebt = sumLiabilities(
    connectedLiabilities,
    (liability) => liability.balance
  )
  const manualCreditDebt = sumLiabilities(
    manualLiabilities,
    (liability) => liability.balance
  )
  const totalLiabilities = sumLiabilities(
    liabilities,
    (liability) => liability.balance
  )
  const totalConnectedLiabilities = sumLiabilities(
    connectedLiabilities,
    (liability) => liability.balance
  )
  const totalManualLiabilities = sumLiabilities(
    manualLiabilities,
    (liability) => liability.balance
  )
  const totalCreditDebt = connectedCreditDebt + manualCreditDebt
  const totalCreditAvailable = sumAssets(
    creditAssets,
    (asset) => asset.availableBalance
  )
  const totalCreditLimit = totalCreditDebt + totalCreditAvailable
  const cashByInstitution = institutionBreakdownsFromAssets(
    liquidAssets,
    (asset) =>
      asset.isConnected
        ? asset.institution || asset.name || 'Unknown'
        : asset.name || 'Manual'
  )
  const creditDebtByInstitution = institutionBreakdownsFromLiabilities(
    liabilities.filter((liability) => liability.liabilityType === 'credit_card'),
    (liability) => liability.institution || liability.name || 'Unknown'
  )
  const creditAvailableByInstitution = institutionBreakdownsFromAssets(
    creditAssets.filter((asset) => asset.isConnected),
    (asset) => asset.institution || asset.name || 'Unknown',
    'available'
  )
  const assetAllocation = allocationItems(
    assets
      .filter((asset) => !asset.isCredit)
      .map((asset) => ({
        label: asset.type || (asset.isManual ? 'Manual' : 'Unknown'),
        value: asset.balance,
      })),
    totalAssetBalance
  )
  const debtAllocation = allocationItems(
    liabilities.map((liability) => ({
      label: liability.liabilityType,
      value: liability.balance,
    })),
    totalLiabilities
  )

  return {
    assets,
    liquidAssets,
    creditAssets,
    connectedAssets,
    manualAssets,
    liabilities,
    manualLiabilities,
    connectedLiabilities,
    totalAssetBalance,
    totalLiquidAvailable,
    totalConnectedLiquidAvailable,
    totalManualLiquidAvailable,
    totalLiabilities,
    totalManualLiabilities,
    totalConnectedLiabilities,
    manualCreditDebt,
    connectedCreditDebt,
    totalCreditDebt,
    totalCreditAvailable,
    totalConnectedAssets: connectedAssets.length,
    totalManualAssets: manualAssets.length,
    totalAssets: assets.length,
    totalCreditAssets: creditAssets.length,
    totalLiquidAssets: liquidAssets.length,
    netWorth: totalAssetBalance - totalLiabilities,
    creditUtilizationPercent:
      totalCreditLimit > 0 ? (totalCreditDebt / totalCreditLimit) * 100 : 0,
    cashByInstitution,
    creditDebtByInstitution,
    creditAvailableByInstitution,
    assetAllocation,
    debtAllocation,
  }
}
