import { getConnectedAssets } from './assets'
import { getCreditCards, getManualAccounts } from './accounts'
import {
  getLedgerSummary,
  type LedgerSummaryTransaction,
} from './ledger-summary'
import { getPortfolioSummary } from './portfolio'
import { buildIncomePlanningSummary } from './income'
import {
  DEFAULT_PLANNING_HORIZON_DAYS,
  generateExpectedIncomeInstances,
} from './payment-truth'
import { activeScheduledPaymentRows } from './legacy-obligation-migration'
import {
  DEFAULT_HOUSEHOLD_TIME_ZONE,
  addCalendarDays,
  dateInTimeZone,
  enumerateRecurringCycles,
} from './recurring-cycle-enumerator'
import {
  buildReconciliationMatches,
  type ReconciliationMatch,
  type ReconciliationPaymentInstance,
  type ReconciliationTransaction,
} from './reconciliation'
import {
  buildPaymentLifecycleSnapshot,
  derivePaymentStateSemantics,
  getObligationLifecyclePaymentItems,
  paymentCountsAsUnpaidRisk,
  paymentRequiresUserAction,
} from '../finance/paymentLifecycle'
import type {
  ConnectedAccount,
  FinancialAsset,
  FinancialSupabaseClient,
  IncomeSchedule,
  InstitutionBalance,
  LiquiditySummary,
  PaymentInstance,
  PortfolioSummary,
  ScheduledPayment,
} from './types'
import { deduplicateLifecyclePaymentsByFinancialIdentity } from './payment-financial-identity'
import { resolveLegacyGraceSemantics } from './legacy-grace-semantics'

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

async function getIncomeSchedule(
  supabase: FinancialSupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from('income_schedule')
    .select('*')
    .eq('user_id', userId)

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

function scheduledPaymentDateWindow(
  scheduledPayment: ScheduledPayment,
  month: number,
  year: number
) {
  const resolved = resolveLegacyGraceSemantics({
    year,
    month,
    dueDay: scheduledPayment.due_day,
    legacyGraceDay: scheduledPayment.grace_day,
  })
  return {
    dueDate: resolved.dueDate,
    graceUntilDate: resolved.graceDeadline,
    graceDays: resolved.graceDays,
  }
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
    if (!match.eligible) return
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
  const dueDate = payment.due_date || payment.expected_date || null
  const graceUntil = payment.grace_until || payment.grace_due_date || null
  const isInGracePeriod =
    snapshot.isOpen &&
    Boolean(dueDate && graceUntil) &&
    String(dueDate) < today &&
    String(graceUntil) >= today
  const semantics = derivePaymentStateSemantics({
    lifecycleState: snapshot.state,
    status: payment.status,
  })

  return {
    ...payment,
    due_date: dueDate,
    grace_until: graceUntil,
    lifecycleState: snapshot.state,
    lifecycleLabel: snapshot.label,
    ...semantics,
    lifecycleIsOpen: snapshot.isOpen,
    lifecycleIsClosed: snapshot.state === 'closed',
    isOverdue: snapshot.state === 'overdue',
    isInGracePeriod,
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

function expectedScheduledPayment(
  scheduledPayment: ScheduledPayment,
  month: number,
  year: number,
  today: string,
  amount: number | null = null
): PaymentInstance | null {
  const dateWindow = scheduledPaymentDateWindow(scheduledPayment, month, year)
  if (!dateWindow.dueDate || !dateWindow.graceUntilDate) return null

  return withLifecycle(
    {
      id: `scheduled:${scheduledPayment.id}:${year}-${month}`,
      name: scheduledPayment.name,
      amount: Number(amount ?? scheduledPayment.amount ?? 0),
      status: 'pending',
      due_date: dateWindow.dueDate,
      expected_date: dateWindow.dueDate,
      effective_due_date: dateWindow.graceUntilDate,
      grace_until: dateWindow.graceUntilDate,
      grace_days: dateWindow.graceDays,
      grace_due_date: dateWindow.graceUntilDate,
      payment_month: month,
      payment_year: year,
      scheduled_payment_id: scheduledPayment.id,
      source: 'scheduled_payment',
      lifecycleItemType: scheduledPayment.credit_card_id
        ? 'card_payment'
        : 'scheduled_payment',
    },
    today
  )
}

export function buildPaymentLifecycleView({
  allPayments,
  scheduledPayments,
  reconciliationTransactions,
  obligationPayments = [],
  today,
  horizonEnd,
}: {
  allPayments: PaymentInstance[]
  scheduledPayments: ScheduledPayment[]
  reconciliationTransactions: LedgerSummaryTransaction[]
  obligationPayments?: PaymentInstance[]
  today: string
  horizonEnd: string
}) {
  const activeScheduledPayments = activeScheduledPaymentRows(scheduledPayments)
  const scheduledPaymentById = new Map(
    activeScheduledPayments.map((payment) => [payment.id, payment])
  )
  const lifecycleStatusIsClosed = (status: string | null | undefined) =>
    ['paid', 'confirmed', 'closed', 'cancelled', 'canceled', 'reconciled'].includes(
      String(status || '').toLowerCase()
    )
  const existingLifecyclePayments = allPayments
    .filter((payment) => {
      const schedule = payment.scheduled_payment_id
        ? scheduledPaymentById.get(payment.scheduled_payment_id)
        : null
      const dateWindow =
        schedule && payment.payment_month && payment.payment_year
          ? scheduledPaymentDateWindow(
              schedule,
              Number(payment.payment_month),
              Number(payment.payment_year)
            )
          : null
      const cycleDate = String(
        payment.effective_due_date ||
          payment.grace_until ||
          payment.grace_due_date ||
          payment.due_date ||
          payment.expected_date ||
          dateWindow?.graceUntilDate ||
          ''
      ).slice(0, 10)

      if (!cycleDate || cycleDate > horizonEnd) return false
      return cycleDate >= today || !lifecycleStatusIsClosed(payment.status)
    })
    .map((payment) => {
      const schedule = payment.scheduled_payment_id
        ? scheduledPaymentById.get(payment.scheduled_payment_id)
        : null
      const dateWindow =
        schedule && payment.payment_month && payment.payment_year
          ? scheduledPaymentDateWindow(
              schedule,
              Number(payment.payment_month),
              Number(payment.payment_year)
            )
          : null

      return {
        ...payment,
        due_date:
          payment.due_date || payment.expected_date || dateWindow?.dueDate || null,
        expected_date:
          payment.expected_date || payment.due_date || dateWindow?.dueDate || null,
        grace_until:
          payment.grace_until ||
          payment.grace_due_date ||
          dateWindow?.graceUntilDate ||
          null,
        grace_days: payment.grace_days ?? dateWindow?.graceDays ?? null,
        grace_due_date:
          payment.grace_due_date ||
          payment.grace_until ||
          dateWindow?.graceUntilDate ||
          null,
        source: 'payment_instance' as const,
        lifecycleItemType: schedule?.credit_card_id
          ? 'card_payment' as const
          : payment.scheduled_payment_id
            ? 'scheduled_payment' as const
            : payment.lifecycleItemType,
      }
    })

  const expectedPayments = activeScheduledPayments.flatMap((payment) => {
    const existingCycles = allPayments
      .filter((instance) => paymentMatchesSchedule(instance, payment))
      .map((instance) => ({
        month: Number(instance.payment_month),
        year: Number(instance.payment_year),
      }))
      .filter(({ month, year }) => month >= 1 && month <= 12 && year > 0)

    return enumerateRecurringCycles({
      source: payment,
      startDate: today,
      horizonEnd,
      existingCycles,
    })
      .map((cycle) =>
        expectedScheduledPayment(
          payment,
          cycle.month,
          cycle.year,
          today,
          previousKnownPaymentAmount(
            allPayments,
            payment,
            cycle.month,
            cycle.year
          )
        )
      )
      .filter((instance): instance is PaymentInstance => instance !== null)
  })
  const openLifecyclePayments = [
    ...existingLifecyclePayments,
    ...expectedPayments,
  ]
  const reconciliation = buildReconciliationMatches({
    transactions: reconciliationTransactions.map(ledgerTransactionForReconciliation),
    payments: openLifecyclePayments.map(paymentForReconciliation),
  })
  const matchesByPaymentId = bestMatchByPaymentId(reconciliation.allMatches)
  const annotatedPayments = openLifecyclePayments.map((payment) =>
    withLifecycle(payment, today, matchesByPaymentId.get(payment.id) || null)
  )

  const bridgedPayments = deduplicateLifecyclePaymentsByFinancialIdentity([
    ...annotatedPayments,
    ...obligationPayments,
  ])
  const sortedPayments = bridgedPayments.sort((a, b) =>
    String(a.effective_due_date || '').localeCompare(
      String(b.effective_due_date || '')
    )
  )

  return sortedPayments
}

export async function getLiquiditySummary(
  supabase: FinancialSupabaseClient,
  userId: string,
  portfolioInput?: PortfolioSummary | Promise<PortfolioSummary>,
  options: { today?: string; horizonDays?: number; timeZone?: string } = {}
): Promise<LiquiditySummary> {
  const now = new Date()
  const timeZone = options.timeZone || DEFAULT_HOUSEHOLD_TIME_ZONE
  const todayString = options.today || dateInTimeZone(now, timeZone)
  const horizonDays = options.horizonDays ?? DEFAULT_PLANNING_HORIZON_DAYS
  const horizonEnd = addCalendarDays(todayString, horizonDays)

  const [
    portfolio,
    connectedAssets,
    manualAccounts,
    creditCards,
    allPayments,
    scheduledPayments,
    incomeSchedule,
    ledgerSummary,
    obligationLifecyclePayments,
  ] = await Promise.all([
    portfolioInput ?? getPortfolioSummary(supabase, userId),
    getConnectedAssets(supabase, userId),
    getManualAccounts(supabase, userId),
    getCreditCards(supabase, userId),
    getPaymentInstances(supabase),
    getActiveScheduledPayments(supabase),
    getIncomeSchedule(supabase, userId),
    getLedgerSummary(supabase, userId),
    getObligationLifecyclePaymentItems(supabase, userId, {
      today: todayString,
      horizonEnd,
    }),
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

  const lifecyclePayments = buildPaymentLifecycleView({
    allPayments,
    scheduledPayments,
    reconciliationTransactions: [
      ...ledgerSummary.confirmedLedgerEntries,
      ...ledgerSummary.importCandidates,
    ],
    obligationPayments: obligationLifecyclePayments,
    today: todayString,
    horizonEnd,
  })

  const pendingActionPayments = lifecyclePayments.filter(
    (payment) => payment.status === 'pending' && paymentRequiresUserAction(payment)
  )

  const initiatedPayments = lifecyclePayments.filter(
    (payment) =>
      payment.bankConfirmationPending === true ||
      (payment.bankConfirmationPending === undefined &&
        payment.status === 'initiated' &&
        payment.lifecycleIsOpen !== false)
  )

  // Backward compatibility: pendingPayments/totalPendingPayments remain the
  // committed unpaid cash view for existing Dashboard consumers. New fields
  // separate pending action from initiated payments waiting confirmation.
  const committedPayments = lifecyclePayments.filter(
    (payment) =>
      paymentCountsAsUnpaidRisk(payment) &&
      (payment.status === 'pending' || payment.status === 'initiated')
  )
  const overduePayments = lifecyclePayments.filter(
    (payment) => payment.isOverdue === true && paymentCountsAsUnpaidRisk(payment)
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

  const income = buildIncomePlanningSummary(incomeSchedule, now)
  const horizonIncome = generateExpectedIncomeInstances({
    schedules: income.allIncome,
    start: todayString,
    end: horizonEnd,
  })
  const schedulesById = new Map(
    income.allIncome.map((schedule) => [schedule.id, schedule])
  )
  const projectedIncome = horizonIncome.instances.map((instance) => ({
    ...(schedulesById.get(instance.scheduleId) || {}),
    id: instance.id,
    name: instance.name,
    amount: instance.amount,
    next_expected_date: instance.date,
    owner_scope: instance.owner,
    confidence: instance.confidence,
    status: 'expected',
    is_active: true,
  })) as IncomeSchedule[]
  const confirmedIncome = projectedIncome
  const totalConfirmedIncome = horizonIncome.instances.reduce(
    (sum, instance) => sum + instance.amount,
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
    income,
    confirmedIncome,
    projectedIncome,
    expectedIncome: income.expectedIncome,
    receivedIncome: income.receivedIncome,
    missedIncome: income.missedIncome,
    cancelledIncome: income.cancelledIncome,
    pendingActionPaymentTotal,
    initiatedPaymentsTotal,
    committedPaymentsTotal,
    totalPendingPayments: committedPaymentsTotal,
    totalConfirmedIncome,
    totalProjectedIncome: totalConfirmedIncome,
    resultToday: cashAvailableTotal - committedPaymentsTotal,
    resultAfterIncome:
      cashAvailableTotal + totalConfirmedIncome - committedPaymentsTotal,
  }
}
