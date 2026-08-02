import type { SupabaseClient } from '@supabase/supabase-js'

export type FinancialSupabaseClient = SupabaseClient

export type ConnectedAccount = {
  id?: string
  plaid_account_id?: string | null
  connection_id?: string | null
  institution_name?: string | null
  name?: string | null
  display_name?: string | null
  type?: string | null
  subtype?: string | null
  available_balance?: number | null
  current_balance?: number | null
  currency?: string | null
  updated_at?: string | null
  owner_scope?: string | null
  account_status?: 'active' | 'hidden' | 'archived' | string | null
  is_hidden?: boolean | null
  include_in_dashboard?: boolean | null
  is_spendable?: boolean | null
  plaid_minimum_payment_amount?: number | null
  plaid_next_payment_due_date?: string | null
  plaid_last_statement_balance?: number | null
  plaid_liability_is_overdue?: boolean | null
  plaid_liability_updated_at?: string | null
  hidden_at?: string | null
  archived_at?: string | null
  archive_reason?: string | null
  portfolio_updated_at?: string | null
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
  owner_id?: string | null
  owner_scope?: string | null
  currency?: string | null
  balance?: number | null
  is_active?: boolean | null
  is_spendable?: boolean | null
  account_status?: 'active' | 'hidden' | 'archived' | string | null
  is_hidden?: boolean | null
  hidden_at?: string | null
  archived_at?: string | null
  archive_reason?: string | null
  replacement_account_id?: string | null
  created_at?: string | null
  updated_at?: string | null
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
  usableBalance: number | null
  currency: string | null
  isLiquid: boolean
  isCredit: boolean
  isManual: boolean
  isConnected: boolean
  metadata: Record<string, unknown>
}

export type LiabilitySource = 'plaid' | 'manual'

export type PortfolioLiability = {
  id: string
  source: LiabilitySource
  sourceId: string | null
  name: string | null
  institution: string | null
  liabilityType: 'credit_card'
  balance: number
  minimumPayment: number | null
  dueDay: number | null
  apr: number | string | null
  currency: string | null
  isManual: boolean
  isConnected: boolean
  metadata: Record<string, unknown>
}

export type PortfolioInstitutionBreakdown = {
  institution: string
  totalBalance: number
  totalAvailable: number
  totalUsable: number
  count: number
}

export type PortfolioAllocationItem = {
  label: string
  value: number
  percent: number
}

export type PortfolioSummary = {
  assets: FinancialAsset[]
  liquidAssets: FinancialAsset[]
  creditAssets: FinancialAsset[]
  connectedAssets: FinancialAsset[]
  manualAssets: FinancialAsset[]
  liabilities: PortfolioLiability[]
  manualLiabilities: PortfolioLiability[]
  connectedLiabilities: PortfolioLiability[]
  totalAssetBalance: number
  totalLiquidAvailable: number
  totalConnectedLiquidAvailable: number
  totalManualLiquidAvailable: number
  totalLiabilities: number
  totalManualLiabilities: number
  totalConnectedLiabilities: number
  manualCreditDebt: number
  connectedCreditDebt: number
  totalCreditDebt: number
  totalCreditAvailable: number
  totalConnectedAssets: number
  totalManualAssets: number
  totalAssets: number
  totalCreditAssets: number
  totalLiquidAssets: number
  netWorth: number
  creditUtilizationPercent: number
  cashByInstitution: PortfolioInstitutionBreakdown[]
  creditDebtByInstitution: PortfolioInstitutionBreakdown[]
  creditAvailableByInstitution: PortfolioInstitutionBreakdown[]
  assetAllocation: PortfolioAllocationItem[]
  debtAllocation: PortfolioAllocationItem[]
}

export type CreditCard = {
  id?: string
  name?: string | null
  bank?: string | null
  owner_id?: string | null
  plaid_account_id?: string | null
  scheduled_payment_id?: string | null
  credit_limit?: number | null
  balance?: number | null
  minimum_payment?: number | null
  due_day?: number | null
  cutoff_day?: number | null
  is_active?: boolean | null
  created_at?: string | null
  card_type?: string | null
  use_case?: string | null
  interest_notes?: string | null
  promo_end_date?: string | null
  regular_apr?: number | null
  promo_apr?: number | null
  autopay_enabled?: boolean | null
  autopay_account_label?: string | null
  payment_account_notes?: string | null
  manual_last4?: string | null
  user_id?: string | null
}

export type PersonOption = {
  id: string
  name: string
}

export type CardProfileSource = 'manual' | 'plaid' | 'merged'

export type CardProfile = {
  id: string
  displayName: string
  institution: string | null
  owner: string | null
  ownerId: string | null
  source: CardProfileSource
  manualCreditCardId: string | null
  plaidAccountId: string | null
  plaidAccountName: string | null
  manualPlaidAccountId: string | null
  scheduledPaymentId: string | null
  manualScheduledPaymentId: string | null
  currentPaymentInstanceId: string | null
  currentPaymentSource: PaymentInstance['source'] | null
  currentBalance: number | null
  availableCredit: number | null
  creditLimit: number | null
  utilizationPercent: number | null
  minimumPayment: number | null
  minimumPaymentSource: string | null
  dueDay: number | null
  nextDueDate: string | null
  dueDateSource: string | null
  graceDeadline: string | null
  balanceSource: string
  availableCreditSource: string
  paymentStatus: string | null
  lastPaymentDate: string | null
  interestNotes: string | null
  regularAprNote: string | null
  promoAprNote: string | null
  regularApr: number | null
  promoApr: number | null
  promoEndDate: string | null
  autopayEnabled: boolean | null
  autopayAccountLabel: string | null
  paymentAccountNotes: string | null
  manualLast4: string | null
  cardType: string | null
  useCase: string | null
  cutoffDay: number | null
  daysUntilPromoEnd: number | null
  promoEndingSoon: boolean
  isActive: boolean
  isConnected: boolean
  warnings: string[]
  scheduleLinkDiagnostics: string[]
  missingDataChecklist: string[]
  linkConfidence: number
  duplicatePlaidAccountIds: string[]
}

export type CardsSummary = {
  cards: CardProfile[]
  attentionNeeded: CardProfile[]
  activeCards: CardProfile[]
  connectedCards: CardProfile[]
  archivedCards: CardProfile[]
  unresolvedCards: CardProfile[]
  ownerOptions: PersonOption[]
  totalBalance: number
  totalAvailableCredit: number
  totalMinimumPayment: number
  warnings: string[]
}

export type PaymentInstance = {
  id: string
  name?: string | null
  amount?: number | null
  status?: string | null
  owner?: string | null
  due_date?: string | null
  expected_date?: string | null
  effective_due_date?: string | null
  grace_until?: string | null
  grace_days?: number | null
  grace_due_date?: string | null
  updated_at?: string | null
  notes?: string | null
  displayNotes?: string | null
  payment_month?: number | null
  payment_year?: number | null
  scheduled_payment_id?: string | null
  source?: 'payment_instance' | 'scheduled_payment' | 'obligation'
  lifecycleItemType?: 'card_payment' | 'scheduled_payment' | 'obligation'
  obligationId?: string | null
  obligationInstanceId?: string | null
  obligationProviderId?: string | null
  obligationType?: string | null
  obligationCategoryCode?: string | null
  obligationProviderName?: string | null
  paymentMethod?: string | null
  legacySourceIds?: string[]
  isEstimated?: boolean
  isInGracePeriod?: boolean
  lifecycleState?: string | null
  lifecycleLabel?: string | null
  settlementState?: string | null
  userActionRequired?: boolean
  countsAsUnpaidRisk?: boolean
  bankConfirmationPending?: boolean
  lifecycleIsOpen?: boolean
  lifecycleIsClosed?: boolean
  isOverdue?: boolean
  daysFromDueDate?: number | null
  lifecycleReasons?: string[]
  lifecycleReconciliationConfidence?: number | null
  lifecycleMatchedTransaction?: {
    id: string
    source: string
    name: string | null
    amount: number
    date: string | null
    confidence: number
    confidenceLevel: string
  } | null
  lifecycleReconciliationReasons?: string[]
  truthStatus?: string | null
  truthReasons?: string[]
}

export type ScheduledPayment = {
  id: string
  name?: string | null
  amount?: number | null
  due_day?: number | null
  credit_card_id?: string | null
  user_id?: string | null
  grace_day?: number | null
  active_months?: string | null
  owner?: string | null
  category?: string | null
  recurrence_type?: string | null
  recurrence_interval?: number | null
  is_active?: boolean | null
  created_at?: string | null
  start_date?: string | null
  end_date?: string | null
}

export type IncomeSchedule = {
  id?: string
  user_id?: string | null
  name?: string | null
  amount?: number | null
  next_expected_date?: string | null
  is_active?: boolean | null
  income_type?: 'one_time' | 'recurring' | string | null
  category_code?: string | null
  amount_is_estimated?: boolean | null
  confidence?: 'estimated' | 'likely' | 'confirmed' | string | null
  owner?: string | null
  owner_scope?: 'household' | 'manuel' | 'soraya' | 'business' | string | null
  destination_account_id?: string | null
  destination_account_source?: 'manual' | 'plaid' | string | null
  cadence?: 'one_time' | 'weekly' | 'biweekly' | 'monthly' | 'irregular' | string | null
  frequency?: string | null
  status?: 'expected' | 'received' | 'missed' | 'cancelled' | string | null
  received_at?: string | null
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type IncomePlanningSummary = {
  allIncome: IncomeSchedule[]
  expectedIncome: IncomeSchedule[]
  receivedIncome: IncomeSchedule[]
  missedIncome: IncomeSchedule[]
  cancelledIncome: IncomeSchedule[]
  projectedIncome: IncomeSchedule[]
  totalProjectedIncome: number
}

export type PlanningItem = {
  id: string
  name?: string | null
  target_amount?: number | null
  current_amount?: number | null
  due_date?: string | null
  item_type?: string | null
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
  lifecyclePayments: PaymentInstance[]
  overduePayments: PaymentInstance[]
  pendingActionPayments: PaymentInstance[]
  initiatedPayments: PaymentInstance[]
  committedPayments: PaymentInstance[]
  pendingPayments: PaymentInstance[]
  income: IncomePlanningSummary
  confirmedIncome: IncomeSchedule[]
  projectedIncome: IncomeSchedule[]
  expectedIncome: IncomeSchedule[]
  receivedIncome: IncomeSchedule[]
  missedIncome: IncomeSchedule[]
  cancelledIncome: IncomeSchedule[]
  pendingActionPaymentTotal: number
  initiatedPaymentsTotal: number
  committedPaymentsTotal: number
  totalPendingPayments: number
  totalConfirmedIncome: number
  totalProjectedIncome: number
  resultToday: number
  resultAfterIncome: number
}

export type PlanningSummary = {
  planningItems: PlanningItem[]
  totalFutureObligations: number
  overduePayments?: PaymentInstance[]
}

export type DashboardSummary = {
  liquidity: LiquiditySummary
  planning: PlanningSummary
}

export type FinancialSummarySeverity = 'info' | 'warning' | 'critical'

export type FinancialSummaryStatus =
  | 'good'
  | 'stable'
  | 'watch'
  | 'risk'
  | 'critical'

export type FinancialSummaryAlert = {
  id: string
  severity: FinancialSummarySeverity
  title: string
  message: string
  metric: string
  value: number
}

export type FinancialSummaryRecommendationAction =
  | 'review_transactions'
  | 'preserve_cash'
  | 'pay_debt'
  | 'review_planning'
  | 'check_income'

export type FinancialSummaryRecommendation = {
  id: string
  actionType: FinancialSummaryRecommendationAction
  priority: number
  title: string
  message: string
  reason: string
}

export type FinancialSummaryBriefing = {
  availableToday: number
  pendingActionPaymentTotal: number
  initiatedPaymentsTotal: number
  committedPaymentsTotal: number
  pendingPaymentsTotal: number
  upcomingIncomeTotal: number
  resultToday: number
  resultAfterIncome: number
  netWorth: number
  totalLiabilities: number
  totalCreditDebt: number
  totalCreditAvailable: number
  pendingReviewCount: number
  liquidityStatus: FinancialSummaryStatus
  debtStatus: FinancialSummaryStatus
  lines: string[]
}

export type FinancialSummaryDashboard = {
  liquidity: {
    availableToday: number
    cashByInstitution: PortfolioInstitutionBreakdown[]
    pendingActionPaymentTotal: number
    pendingActionPayments: PaymentInstance[]
    initiatedPaymentsTotal: number
    initiatedPayments: PaymentInstance[]
    committedPaymentsTotal: number
    committedPayments: PaymentInstance[]
    pendingPaymentsTotal: number
    pendingPayments: PaymentInstance[]
    upcomingIncomeTotal: number
    confirmedIncome: IncomeSchedule[]
    resultToday: number
    resultAfterIncome: number
  }
  debt: {
    totalCreditDebt: number
    manualCreditDebt: number
    connectedCreditDebt: number
    totalCreditAvailable: number
    minimumPaymentsTotal: number
    creditDebtByInstitution: PortfolioInstitutionBreakdown[]
    creditAvailableByInstitution: PortfolioInstitutionBreakdown[]
  }
  portfolio: {
    totalAssetBalance: number
    totalLiabilities: number
    netWorth: number
    assetAllocation: PortfolioAllocationItem[]
    debtAllocation: PortfolioAllocationItem[]
  }
  planning: {
    totalFutureObligations: number
    planningItems: PlanningItem[]
  }
}

export type FinancialSummaryHealth = {
  cashAvailable: number
  totalCreditDebt: number
  totalLiabilities: number
  netWorth: number
  creditUtilizationPercent: number
  pendingActionPaymentTotal: number
  initiatedPaymentsTotal: number
  committedPaymentsTotal: number
  pendingPaymentsTotal: number
  planningObligationsTotal: number
  liquidityStatus: FinancialSummaryStatus
  debtStatus: FinancialSummaryStatus
  strengths: string[]
  risks: string[]
}

export type FinancialSummary = {
  generatedAt: string
  userId: string
  briefing: FinancialSummaryBriefing
  dashboard: FinancialSummaryDashboard
  health: FinancialSummaryHealth
  alerts: FinancialSummaryAlert[]
  recommendations: FinancialSummaryRecommendation[]
  source: {
    portfolio: PortfolioSummary
    liquidity: LiquiditySummary
    planning: PlanningSummary
    dashboard: DashboardSummary
  }
}
