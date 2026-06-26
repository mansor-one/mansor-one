import type { SupabaseClient } from '@supabase/supabase-js'

export type FinancialSupabaseClient = SupabaseClient

export type ConnectedAccount = {
  id?: string
  plaid_account_id?: string | null
  connection_id?: string | null
  institution_name?: string | null
  name?: string | null
  type?: string | null
  subtype?: string | null
  available_balance?: number | null
  current_balance?: number | null
  currency?: string | null
  updated_at?: string | null
}

export type ResolvedConnectedAccount = ConnectedAccount & {
  sourceAccounts: ConnectedAccount[]
  merged: boolean
  duplicates: ConnectedAccount[]
}

export type DuplicateAccountGroup = {
  groupKey: string
  institution_name?: string | null
  name?: string | null
  type?: string | null
  subtype?: string | null
  sourceAccounts: ConnectedAccount[]
}

export type ResolvedAccountsResult = {
  resolvedAccounts: ResolvedConnectedAccount[]
  duplicateGroups: DuplicateAccountGroup[]
  warnings: string[]
}

export type ManualAccount = {
  id?: string
  name?: string | null
  account_type?: string | null
  currency?: string | null
  balance?: number | null
  is_active?: boolean | null
  is_spendable?: boolean | null
}

export type AssetSource = 'plaid' | 'manual'

export type FinancialAsset = {
  id: string
  source: AssetSource
  sourceId: string | null
  institution: string | null
  name: string | null
  type: string | null
  subtype: string | null
  balance: number
  availableBalance: number
  currency: string | null
  isLiquid: boolean
  isCredit: boolean
  isManual: boolean
  isConnected: boolean
  metadata: Record<string, unknown>
}

export type PortfolioSummary = {
  assets: FinancialAsset[]
  liquidAssets: FinancialAsset[]
  creditAssets: FinancialAsset[]
  connectedAssets: FinancialAsset[]
  manualAssets: FinancialAsset[]
  totalAssetBalance: number
  totalLiquidAvailable: number
  totalConnectedLiquidAvailable: number
  totalManualLiquidAvailable: number
  totalCreditDebt: number
  totalCreditAvailable: number
  totalConnectedAssets: number
  totalManualAssets: number
  totalAssets: number
  totalCreditAssets: number
  totalLiquidAssets: number
  netWorth: number
  creditUtilizationPercent: number
}

export type CreditCard = {
  id?: string
  name?: string | null
  balance?: number | null
  minimum_payment?: number | null
  due_day?: number | null
  is_active?: boolean | null
}

export type PaymentInstance = {
  id: string
  name?: string | null
  amount?: number | null
  status?: string | null
  effective_due_date?: string | null
  payment_month?: number | null
  payment_year?: number | null
}

export type IncomeSchedule = {
  id?: string
  name?: string | null
  amount?: number | null
  next_expected_date?: string | null
  is_active?: boolean | null
}

export type PlanningItem = {
  id: string
  name?: string | null
  target_amount?: number | null
  due_date?: string | null
  is_archived?: boolean | null
  is_completed?: boolean | null
}

export type InstitutionBalance = {
  institution: string
  balance: number
}

export type AccountsSummary = {
  connectedAccounts: ConnectedAccount[]
  manualAccounts: ManualAccount[]
  creditCards: CreditCard[]
  plaidCash: ConnectedAccount[]
  plaidCredit: ConnectedAccount[]
  manualCash: ManualAccount[]
  plaidCashByInstitution: InstitutionBalance[]
  plaidCreditAvailableByInstitution: InstitutionBalance[]
  plaidCreditDebtByInstitution: InstitutionBalance[]
  cashAvailablePlaid: number
  cashAvailableManual: number
  cashAvailableTotal: number
  connectedCreditDebt: number
  connectedCreditAvailable: number
  manualCardDebt: number
  manualMinimumPayments: number
}

export type LiquiditySummary = AccountsSummary & {
  pendingPayments: PaymentInstance[]
  confirmedIncome: IncomeSchedule[]
  totalPendingPayments: number
  totalConfirmedIncome: number
  resultToday: number
  resultAfterIncome: number
}

export type PlanningSummary = {
  planningItems: PlanningItem[]
  totalFutureObligations: number
}

export type DashboardSummary = {
  liquidity: LiquiditySummary
  planning: PlanningSummary
}
