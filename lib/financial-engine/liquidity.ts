import { getConnectedAssets } from './assets'
import { getCreditCards, getManualAccounts } from './accounts'
import { getPortfolioSummary } from './portfolio'
import type {
  ConnectedAccount,
  FinancialAsset,
  FinancialSupabaseClient,
  IncomeSchedule,
  InstitutionBalance,
  LiquiditySummary,
  PaymentInstance,
} from './types'

function accountBalance(account: ConnectedAccount) {
  return Number(account.available_balance ?? account.current_balance ?? 0)
}

function assetAsConnectedAccount(asset: FinancialAsset): ConnectedAccount {
  return {
    id: asset.metadata.accountId as string | undefined,
    plaid_account_id: asset.sourceId,
    connection_id: asset.metadata.connectionId as string | undefined,
    institution_name: asset.institution,
    name: asset.name,
    type: asset.type,
    subtype: asset.subtype,
    available_balance: asset.availableBalance,
    current_balance: asset.balance,
    currency: asset.currency,
    updated_at: asset.metadata.updatedAt as string | undefined,
  }
}

function institutionBalances(
  accounts: ConnectedAccount[],
  getBalance: (account: ConnectedAccount) => number
): InstitutionBalance[] {
  const totals = accounts.reduce((acc, account) => {
    const institution = account.institution_name || 'Institución desconocida'
    acc[institution] = (acc[institution] || 0) + getBalance(account)
    return acc
  }, {} as Record<string, number>)

  return Object.entries(totals).map(([institution, balance]) => ({
    institution,
    balance,
  }))
}

async function getCurrentMonthPayments(
  supabase: FinancialSupabaseClient,
  date: Date
) {
  const month = date.getMonth() + 1
  const year = date.getFullYear()

  const { data, error } = await supabase
    .from('payment_instances')
    .select('*')
    .eq('payment_month', month)
    .eq('payment_year', year)

  if (error) throw error

  return (data || []) as PaymentInstance[]
}

async function getActiveIncomeSchedule(supabase: FinancialSupabaseClient) {
  const { data, error } = await supabase
    .from('income_schedule')
    .select('*')
    .eq('is_active', true)

  if (error) throw error

  return (data || []) as IncomeSchedule[]
}

export async function getLiquiditySummary(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<LiquiditySummary> {
  const now = new Date()

  const [
    portfolio,
    connectedAssets,
    manualAccounts,
    creditCards,
    payments,
    incomeSchedule,
  ] = await Promise.all([
    getPortfolioSummary(supabase, userId),
    getConnectedAssets(supabase, userId),
    getManualAccounts(supabase, userId),
    getCreditCards(supabase, userId),
    getCurrentMonthPayments(supabase, now),
    getActiveIncomeSchedule(supabase),
  ])

  const connectedAccounts = connectedAssets.map(assetAsConnectedAccount)

  const plaidCash = connectedAccounts.filter((account) =>
    ['depository', 'cash'].includes(account.type || '')
  )

  const plaidCredit = connectedAccounts.filter(
    (account) => account.type === 'credit'
  )

  const manualCash = manualAccounts.filter(
    (account) => account.is_spendable === true
  )

  // Legacy connected-only breakdown kept for existing Dashboard consumers.
  // Portfolio owns authoritative cash/asset/debt facts, including usable cash.
  const plaidCashByInstitution = institutionBalances(
    plaidCash,
    accountBalance
  )

  const plaidCreditAvailableByInstitution = institutionBalances(
    plaidCredit,
    (account) => Number(account.available_balance ?? 0)
  )

  const plaidCreditDebtByInstitution = institutionBalances(
    plaidCredit,
    (account) => Number(account.current_balance ?? 0)
  )

  // Liquidity owns payment and income timing. Cash projections use Portfolio's
  // usableBalance policy so available cash is not overstated.
  const cashAvailablePlaid = portfolio.totalConnectedLiquidAvailable
  const cashAvailableManual = portfolio.totalManualLiquidAvailable
  const cashAvailableTotal = portfolio.totalLiquidAvailable

  const pendingActionPayments = payments.filter(
    (payment) => payment.status === 'pending'
  )

  const initiatedPayments = payments.filter(
    (payment) => payment.status === 'initiated'
  )

  // Backward compatibility: pendingPayments/totalPendingPayments remain the
  // committed unpaid cash view for existing Dashboard consumers. New fields
  // separate pending action from initiated payments waiting confirmation.
  const committedPayments = payments.filter(
    (payment) =>
      payment.status === 'pending' || payment.status === 'initiated'
  )

  const pendingActionPaymentTotal = pendingActionPayments.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0
  )

  const initiatedPaymentsTotal = initiatedPayments.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0
  )

  const committedPaymentsTotal = committedPayments.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const confirmedIncome = incomeSchedule
    .filter((income) => {
      if (!income.amount || !income.next_expected_date) return false

      const incomeDate = new Date(`${income.next_expected_date}T00:00:00`)
      return incomeDate >= today
    })
    .sort(
      (a, b) =>
        new Date(`${a.next_expected_date}T00:00:00`).getTime() -
        new Date(`${b.next_expected_date}T00:00:00`).getTime()
    )

  const totalConfirmedIncome = confirmedIncome.reduce(
    (sum, income) => sum + Number(income.amount || 0),
    0
  )

  const connectedCreditDebt = plaidCredit.reduce(
    (sum, account) => sum + Number(account.current_balance || 0),
    0
  )

  const connectedCreditAvailable = plaidCredit.reduce(
    (sum, account) => sum + Number(account.available_balance || 0),
    0
  )

  const manualCardDebt = creditCards.reduce(
    (sum, card) => sum + Number(card.balance || 0),
    0
  )

  const manualMinimumPayments = creditCards.reduce(
    (sum, card) => sum + Number(card.minimum_payment || 0),
    0
  )

  return {
    connectedAccounts,
    manualAccounts,
    creditCards,
    plaidCash,
    plaidCredit,
    manualCash,
    plaidCashByInstitution,
    plaidCreditAvailableByInstitution,
    plaidCreditDebtByInstitution,
    cashAvailablePlaid,
    cashAvailableManual,
    cashAvailableTotal,
    connectedCreditDebt,
    connectedCreditAvailable,
    manualCardDebt,
    manualMinimumPayments,
    pendingActionPayments,
    initiatedPayments,
    committedPayments,
    pendingPayments: committedPayments,
    confirmedIncome,
    pendingActionPaymentTotal,
    initiatedPaymentsTotal,
    committedPaymentsTotal,
    totalPendingPayments: committedPaymentsTotal,
    totalConfirmedIncome,
    resultToday: cashAvailableTotal - committedPaymentsTotal,
    resultAfterIncome:
      cashAvailableTotal + totalConfirmedIncome - committedPaymentsTotal,
  }
}
