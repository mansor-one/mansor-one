import { getConnectedAssets } from './assets'
import { getCreditCards, getManualAccounts } from './accounts'
import {
  getLedgerSummary,
  type LedgerSummaryTransaction,
} from './ledger-summary'
import { getPortfolioSummary } from './portfolio'
import {
  buildReconciliationMatches,
  type ReconciliationMatch,
  type ReconciliationPaymentInstance,
  type ReconciliationTransaction,
} from './reconciliation'
import { buildPaymentLifecycleSnapshot } from '../finance/paymentLifecycle'
import type {
  ConnectedAccount,
  FinancialAsset,
  FinancialSupabaseClient,
  IncomeSchedule,
  InstitutionBalance,
  LiquiditySummary,
  PaymentInstance,
  ScheduledPayment,
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

async function getPaymentInstances(supabase: FinancialSupabaseClient) {
  const { data, error } = await supabase
    .from('payment_instances')
    .select('*')

  if (error) throw error

  return (data || []) as PaymentInstance[]
}

async function getActiveScheduledPayments(supabase: FinancialSupabaseClient) {
  const { data, error } = await supabase
    .from('scheduled_payments')
    .select('*')
    .eq('is_active', true)

  if (error) throw error

  return (data || []) as ScheduledPayment[]
}

async function getActiveIncomeSchedule(supabase: FinancialSupabaseClient) {
  const { data, error } = await supabase
    .from('income_schedule')
    .select('*')
    .eq('is_active', true)

  if (error) throw error

  return (data || []) as IncomeSchedule[]
}

function normalizePaymentName(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function scheduledPaymentActiveForMonth(
  payment: ScheduledPayment,
  month: number
) {
  if (!payment.active_months) return true

  return payment.active_months
    .split(',')
    .map((value) => Number(value.trim()))
    .includes(month)
}

export function paymentMatchesSchedule(
  payment: PaymentInstance,
  scheduledPayment: ScheduledPayment
) {
  if (
    payment.scheduled_payment_id &&
    payment.scheduled_payment_id === scheduledPayment.id
  ) {
    return true
  }

  const paymentName = normalizePaymentName(payment.name)
  const scheduledName = normalizePaymentName(scheduledPayment.name)

  return Boolean(
    paymentName &&
      scheduledName &&
      (paymentName.includes(scheduledName) || scheduledName.includes(paymentName))
  )
}

function paymentForCycle(
  payments: PaymentInstance[],
  scheduledPayment: ScheduledPayment,
  month: number,
  year: number
) {
  return payments.find(
    (payment) =>
      Number(payment.payment_month) === month &&
      Number(payment.payment_year) === year &&
      paymentMatchesSchedule(payment, scheduledPayment)
  )
}

function nextCycle(month: number, year: number) {
  if (month === 12) return { month: 1, year: year + 1 }

  return { month: month + 1, year }
}

function previousKnownPaymentAmount(
  payments: PaymentInstance[],
  scheduledPayment: ScheduledPayment,
  month: number,
  year: number
) {
  const sortedPayments = payments
    .filter((payment) => paymentMatchesSchedule(payment, scheduledPayment))
    .filter((payment) => {
      const paymentYear = Number(payment.payment_year || 0)
      const paymentMonth = Number(payment.payment_month || 0)

      return (
        paymentYear < year ||
        (paymentYear === year && paymentMonth < month)
      )
    })
    .sort((a, b) => {
      const left = Number(a.payment_year || 0) * 100 + Number(a.payment_month || 0)
      const right = Number(b.payment_year || 0) * 100 + Number(b.payment_month || 0)

      return right - left
    })

  return Number(sortedPayments[0]?.amount || scheduledPayment.amount || 0)
}

function dateForScheduledPayment(
  scheduledPayment: ScheduledPayment,
  month: number,
  year: number
) {
  const dueDay = Number(scheduledPayment.due_day || 0)
  const graceValue = Number(scheduledPayment.grace_day || 0)
  const day = graceValue || dueDay
  if (!day) return null

  if (graceValue && dueDay && graceValue !== dueDay && graceValue < dueDay) {
    const dueDate = new Date(year, month - 1, dueDay)
    dueDate.setDate(dueDate.getDate() + graceValue)

    return dueDate.toISOString().slice(0, 10)
  }

  const lastDay = new Date(year, month, 0).getDate()
  const safeDay = Math.min(day, lastDay)
  const paddedMonth = String(month).padStart(2, '0')
  const paddedDay = String(safeDay).padStart(2, '0')

  return `${year}-${paddedMonth}-${paddedDay}`
}

function scheduleExistedByCycleDueDate(
  scheduledPayment: ScheduledPayment,
  month: number,
  year: number
) {
  if (!scheduledPayment.created_at) return true

  const dueDate = dateForScheduledPayment(scheduledPayment, month, year)
  if (!dueDate) return true

  return scheduledPayment.created_at.slice(0, 10) <= dueDate
}

function ledgerTransactionForReconciliation(
  transaction: LedgerSummaryTransaction
): ReconciliationTransaction {
  return {
    source: transaction.sourceTable,
    id: transaction.id,
    name: transaction.description,
    amount: transaction.amount,
    date: transaction.date,
    institutionName:
      typeof transaction.metadata.institutionName === 'string'
        ? transaction.metadata.institutionName
        : null,
    accountName:
      typeof transaction.metadata.accountName === 'string'
        ? transaction.metadata.accountName
        : null,
    accountType:
      typeof transaction.metadata.accountType === 'string'
        ? transaction.metadata.accountType
        : null,
    accountSubtype:
      typeof transaction.metadata.accountSubtype === 'string'
        ? transaction.metadata.accountSubtype
        : null,
    category: transaction.category,
  }
}

function paymentForReconciliation(
  payment: PaymentInstance
): ReconciliationPaymentInstance {
  return {
    id: payment.id,
    name: payment.name || null,
    amount: Number(payment.amount || 0),
    status: payment.status || null,
    effective_due_date: payment.effective_due_date || null,
    updated_at: payment.updated_at || null,
    notes: payment.notes || null,
    scheduled_payment_id: payment.scheduled_payment_id || null,
  }
}

function bestMatchByPaymentId(matches: ReconciliationMatch[]) {
  const byPaymentId = new Map<string, ReconciliationMatch>()

  matches.forEach((match) => {
    const current = byPaymentId.get(match.paymentInstanceId)
    if (!current || match.confidence > current.confidence) {
      byPaymentId.set(match.paymentInstanceId, match)
    }
  })

  return byPaymentId
}

function paymentReconciliationReason(
  lifecycleState: string | null,
  match: ReconciliationMatch | null
) {
  if (match) return match.reasons

  if (lifecycleState === 'overdue') {
    return [
      'No confirmed ledger transaction matched this expected payment strongly enough.',
    ]
  }

  return []
}

function withLifecycle(
  payment: PaymentInstance,
  today: string,
  match: ReconciliationMatch | null = null
): PaymentInstance {
  const confirmedLedgerMatch =
    match && match.transactionSource === 'quick_entries' && match.confidence >= 70
  const detectedTransactionMatch = Boolean(match && match.confidence >= 50)
  const snapshot = buildPaymentLifecycleSnapshot({
    status: payment.status ?? null,
    effectiveDueDate: payment.effective_due_date || null,
    today,
    hasDetectedTransaction: detectedTransactionMatch,
    hasConfirmedLedgerEntry: Boolean(confirmedLedgerMatch),
  })

  return {
    ...payment,
    lifecycleState: snapshot.state,
    lifecycleLabel: snapshot.label,
    lifecycleIsOpen: snapshot.isOpen,
    lifecycleIsClosed: snapshot.state === 'closed',
    isOverdue: snapshot.state === 'overdue',
    daysFromDueDate: snapshot.daysFromDueDate,
    lifecycleReasons: snapshot.reasons,
    lifecycleReconciliationConfidence: match?.confidence ?? null,
    lifecycleMatchedTransaction: match
      ? {
          id: match.transactionId,
          source: match.transactionSource,
          name: match.transactionName,
          amount: match.transactionAmount,
          date: match.transactionDate,
          confidence: match.confidence,
          confidenceLevel: match.confidenceLevel,
        }
      : null,
    lifecycleReconciliationReasons: paymentReconciliationReason(
      snapshot.state,
      match
    ),
  }
}

function lifecyclePaymentScheduleKey(payment: PaymentInstance) {
  return (
    payment.scheduled_payment_id ||
    normalizePaymentName(payment.name) ||
    payment.id
  )
}

function earliestOpenCyclePerSchedule(payments: PaymentInstance[]) {
  const seenOpenSchedules = new Set<string>()

  return payments.filter((payment) => {
    if (payment.lifecycleIsOpen === false) return true

    const key = lifecyclePaymentScheduleKey(payment)
    if (seenOpenSchedules.has(key)) return false

    seenOpenSchedules.add(key)
    return true
  })
}

function expectedScheduledPayment(
  scheduledPayment: ScheduledPayment,
  month: number,
  year: number,
  today: string,
  amount: number | null = null
): PaymentInstance | null {
  const effectiveDueDate = dateForScheduledPayment(scheduledPayment, month, year)
  if (!effectiveDueDate) return null

  return withLifecycle(
    {
      id: `scheduled:${scheduledPayment.id}:${year}-${month}`,
      name: scheduledPayment.name,
      amount: Number(amount ?? scheduledPayment.amount ?? 0),
      status: 'pending',
      effective_due_date: effectiveDueDate,
      payment_month: month,
      payment_year: year,
      scheduled_payment_id: scheduledPayment.id,
      source: 'scheduled_payment',
    },
    today
  )
}

export function buildPaymentLifecycleView({
  currentPayments,
  allPayments,
  scheduledPayments,
  confirmedLedgerEntries,
  month,
  year,
  today,
}: {
  currentPayments: PaymentInstance[]
  allPayments: PaymentInstance[]
  scheduledPayments: ScheduledPayment[]
  confirmedLedgerEntries: LedgerSummaryTransaction[]
  month: number
  year: number
  today: string
}) {
  const currentLifecyclePayments = currentPayments.map((payment) => ({
    ...payment,
    source: 'payment_instance' as const,
  }))

  const expectedPayments = scheduledPayments
    .filter((payment) => scheduledPaymentActiveForMonth(payment, month))
    .filter((payment) => scheduleExistedByCycleDueDate(payment, month, year))
    .filter(
      (payment) =>
        !paymentForCycle(allPayments, payment, month, year)
    )
    .map((payment) =>
      expectedScheduledPayment(
        payment,
        month,
        year,
        today,
        previousKnownPaymentAmount(allPayments, payment, month, year)
      )
    )
    .filter((payment): payment is PaymentInstance => payment !== null)
  const next = nextCycle(month, year)
  const nextExpectedPayments = scheduledPayments
    .filter((payment) => scheduledPaymentActiveForMonth(payment, next.month))
    .filter((payment) => !paymentForCycle(allPayments, payment, next.month, next.year))
    .map((payment) =>
      expectedScheduledPayment(
        payment,
        next.month,
        next.year,
        today,
        previousKnownPaymentAmount(allPayments, payment, next.month, next.year)
      )
    )
    .filter((payment): payment is PaymentInstance => payment !== null)
  const openLifecyclePayments = [
    ...currentLifecyclePayments,
    ...expectedPayments,
    ...nextExpectedPayments,
  ]
  const reconciliation = buildReconciliationMatches({
    transactions: confirmedLedgerEntries.map(ledgerTransactionForReconciliation),
    payments: openLifecyclePayments.map(paymentForReconciliation),
  })
  const matchesByPaymentId = bestMatchByPaymentId(reconciliation.allMatches)
  const annotatedPayments = openLifecyclePayments.map((payment) =>
    withLifecycle(payment, today, matchesByPaymentId.get(payment.id) || null)
  )

  const sortedPayments = annotatedPayments.sort((a, b) =>
    String(a.effective_due_date || '').localeCompare(
      String(b.effective_due_date || '')
    )
  )

  return earliestOpenCyclePerSchedule(sortedPayments)
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
    allPayments,
    scheduledPayments,
    incomeSchedule,
    ledgerSummary,
  ] = await Promise.all([
    getPortfolioSummary(supabase, userId),
    getConnectedAssets(supabase, userId),
    getManualAccounts(supabase, userId),
    getCreditCards(supabase, userId),
    getCurrentMonthPayments(supabase, now),
    getPaymentInstances(supabase),
    getActiveScheduledPayments(supabase),
    getActiveIncomeSchedule(supabase),
    getLedgerSummary(supabase, userId),
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

  const todayString = now.toISOString().slice(0, 10)
  const lifecyclePayments = buildPaymentLifecycleView({
    currentPayments: payments,
    allPayments,
    scheduledPayments,
    confirmedLedgerEntries: ledgerSummary.confirmedLedgerEntries,
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    today: todayString,
  })

  const pendingActionPayments = lifecyclePayments.filter(
    (payment) => payment.status === 'pending' && payment.lifecycleIsOpen !== false
  )

  const initiatedPayments = lifecyclePayments.filter(
    (payment) => payment.status === 'initiated' && payment.lifecycleIsOpen !== false
  )

  // Backward compatibility: pendingPayments/totalPendingPayments remain the
  // committed unpaid cash view for existing Dashboard consumers. New fields
  // separate pending action from initiated payments waiting confirmation.
  const committedPayments = lifecyclePayments.filter(
    (payment) =>
      payment.lifecycleIsOpen !== false &&
      (payment.status === 'pending' || payment.status === 'initiated')
  )
  const overduePayments = lifecyclePayments.filter(
    (payment) => payment.isOverdue === true
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
    lifecyclePayments,
    overduePayments,
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
