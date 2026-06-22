export type LiabilityStatus =
  | 'due_today'
  | 'in_grace'
  | 'overdue'
  | 'due_soon'
  | 'normal'

export interface FinancialDecisionContext {
  cashAvailable: number
  currentBankBalances: number
  creditAvailable: number
  connectedCreditDebt: number
  totalCreditCardDebt: number
  pendingPaymentInstances: Array<PaymentInstance>
  totalPendingPayments: number
  upcomingIncome: number
  unpaidCriticalLiabilities: Array<CriticalLiability>
  totalCriticalLiabilityPayments: number
  totalObligationsThisPeriod: number
  shortfallToday: number
  projectedCashAfterIncome: number
  projectedCashAfterAllObligations: number
  recommendationLevel: 'critical' | 'warning' | 'ok'
  recommendationSummary: string
  attentionItems: Array<AttentionItem>
}

export interface PaymentInstance {
  id: string
  name: string
  amount: number
  status: string
  payment_month: number
  payment_year: number
  effective_due_date?: string | null
}

export interface IncomeScheduleItem {
  id: string
  name: string
  amount: number
  next_expected_date: string | null
  is_active: boolean
}

export interface CreditCard {
  id: string
  balance: number
  is_active: boolean
}

export interface PlaidAccount {
  id: string
  type: string
  available_balance: number | null
  current_balance: number | null
  institution_name: string | null
}

export interface Liability {
  id: string
  name: string
  is_active: boolean
  monthly_payment: number | null
  due_day: number | null
  grace_day: number | null
}

export interface CriticalLiability extends Liability {
  status: LiabilityStatus
  daysUntil: number | null
}

export interface AttentionItem {
  id: string
  name: string
  amount: number
  status: LiabilityStatus
  daysUntil: number | null
  kind: 'liability' | 'payment'
}

const LIABILITY_MATCH_PATTERNS = [
  ['hipoteca', 'hipoteca'],
  ['honda', 'honda'],
  ['toyota', 'toyota'],
]

const DEFAULT_TIME_ZONE = 'America/Puerto_Rico'

function normalizeName(name: string | null | undefined) {
  return String(name || '').toLowerCase().trim()
}

function getDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)

  return new Date(Date.UTC(year, month - 1, day))
}

function liabilityHasPaidMatch(liabilityName: string, payments: PaymentInstance[]) {
  const normalizedLiability = normalizeName(liabilityName)
  return payments.some((payment) => {
    if (payment.status !== 'paid') return false
    const normalizedPayment = normalizeName(payment.name)
    return LIABILITY_MATCH_PATTERNS.some(
      ([pattern]) =>
        normalizedLiability.includes(pattern) && normalizedPayment.includes(pattern)
    )
  })
}

function computeLiabilityStatus(
  liability: Liability,
  now: Date
): { status: LiabilityStatus; daysUntil: number | null } {
  const dueDay = liability.due_day ?? null
  const graceDay = liability.grace_day ?? null
  const today = getDateInTimeZone(now, DEFAULT_TIME_ZONE)

  if (!dueDay) {
    return { status: 'normal', daysUntil: null }
  }

  const dueDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), dueDay))
  const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  const graceDate = graceDay
    ? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), graceDay))
    : null

  if (daysUntil === 0) return { status: 'due_today', daysUntil }
  if (daysUntil < 0) {
    if (graceDate && today.getTime() <= graceDate.getTime()) {
      return { status: 'in_grace', daysUntil }
    }
    return { status: 'overdue', daysUntil }
  }

  if (daysUntil <= 7) return { status: 'due_soon', daysUntil }
  return { status: 'normal', daysUntil }
}

function computePaymentInstanceStatus(
  payment: PaymentInstance,
  now: Date
): { status: LiabilityStatus; daysUntil: number | null } {
  if (!payment.effective_due_date) return { status: 'normal', daysUntil: null }
  try {
    const due = new Date(payment.effective_due_date)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate())
    const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntil === 0) return { status: 'due_today', daysUntil }
    if (daysUntil < 0) return { status: 'overdue', daysUntil }
    if (daysUntil <= 7) return { status: 'due_soon', daysUntil }
    return { status: 'normal', daysUntil }
  } catch {
    return { status: 'normal', daysUntil: null }
  }
}

export async function getFinancialDecisionContext(
  supabase: any
): Promise<FinancialDecisionContext> {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const [{ data: plaidAccounts }, { data: payments }, { data: income }, { data: liabilities }, { data: creditCards }, { data: accounts }] =
    await Promise.all([
      supabase.from('plaid_accounts').select('*'),
      supabase.from('payment_instances').select('*'),
      supabase.from('income_schedule').select('*').eq('is_active', true),
      supabase.from('liabilities').select('*').eq('is_active', true),
      supabase.from('credit_cards').select('*').eq('is_active', true),
      supabase.from('accounts').select('*').eq('is_active', true),
    ])

  const plaidData: PlaidAccount[] = (plaidAccounts ?? []) as PlaidAccount[]
  const paymentsData: PaymentInstance[] = (payments ?? []) as PaymentInstance[]
  const incomeData: IncomeScheduleItem[] = (income ?? []) as IncomeScheduleItem[]
  const liabilitiesData: Liability[] = (liabilities ?? []) as Liability[]
  const creditCardsData: CreditCard[] = (creditCards ?? []) as CreditCard[]

  const cashAvailable = plaidData
    .filter((account) => account.type === 'depository')
    .reduce((sum, account) => {
      const balance =
        account.available_balance != null
          ? account.available_balance
          : account.current_balance ?? 0
      return sum + Number(balance)
    }, 0)

  const currentBankBalances = plaidData
    .filter((account) => account.type === 'depository')
    .reduce((sum, account) => sum + Number(account.current_balance ?? 0), 0)

  const creditAvailable = plaidData
    .filter((account) => account.type === 'credit')
    .reduce((sum, account) => sum + Number(account.available_balance ?? 0), 0)

  const connectedCreditDebt = plaidData
    .filter((account) => account.type === 'credit')
    .reduce((sum, account) => sum + Number(account.current_balance ?? 0), 0)

  const totalCreditCardDebt = creditCardsData.reduce(
    (sum, card) => sum + Number(card.balance ?? 0),
    0
  )

  const pendingPaymentInstances = paymentsData
    .filter(
      (payment) =>
        payment.status !== 'paid' &&
        payment.payment_month === month &&
        payment.payment_year === year
    )

  const totalPendingPayments = pendingPaymentInstances.reduce(
    (sum, payment) => sum + Number(payment.amount ?? 0),
    0
  )

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const upcomingIncome = incomeData
    .filter((item) => {
      if (!item.is_active || !item.next_expected_date || !item.amount) {
        return false
      }
      try {
        const [itemYear, itemMonth] = item.next_expected_date.split('-').map(Number)
        return itemYear === year && itemMonth === month
      } catch {
        return false
      }
    })
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const criticalLiabilities = liabilitiesData
    .filter((liability) => liability.monthly_payment && liability.due_day)
    .map((liability) => {
      const matched = liabilityHasPaidMatch(liability.name, paymentsData)
      const { status, daysUntil } = computeLiabilityStatus(liability, now)
      return { ...liability, status, daysUntil, matched }
    })
    .filter((liability) => liability.status !== 'normal' && !liability.matched)

  const paymentAttentionItems = (paymentsData ?? [])
    .filter((p) => p.status !== 'paid' && p.effective_due_date)
    .map((p) => {
      const { status, daysUntil } = computePaymentInstanceStatus(p, now)
      return {
        id: p.id,
        name: p.name,
        amount: Number(p.amount ?? 0),
        status,
        daysUntil,
        kind: 'payment' as const,
      }
    })
    .filter((item) => item.status !== 'normal')

  const criticalLiabilitiesItems: AttentionItem[] = criticalLiabilities.map((l) => ({
    id: l.id,
    name: l.name,
    amount: Number(l.monthly_payment ?? 0),
    status: l.status,
    daysUntil: l.daysUntil,
    kind: 'liability',
  }))

  const attentionItems: AttentionItem[] = [...criticalLiabilitiesItems, ...paymentAttentionItems]

  const totalCriticalLiabilityPayments = criticalLiabilities.reduce(
    (sum, liability) => sum + Number(liability.monthly_payment ?? 0),
    0
  )

  const overduePayments = paymentAttentionItems.filter((p) => p.status === 'overdue')
  const overduePaymentCount = overduePayments.length
  const overduePaymentTotal = overduePayments.reduce((s, p) => s + Number(p.amount ?? 0), 0)

  const totalObligationsThisPeriod =
    totalPendingPayments + totalCriticalLiabilityPayments

  const shortfallToday = cashAvailable - totalObligationsThisPeriod

  const projectedCashAfterIncome = cashAvailable + upcomingIncome - totalPendingPayments

  const projectedCashAfterAllObligations =
    cashAvailable + upcomingIncome - totalObligationsThisPeriod

  const recommendationLevel = projectedCashAfterAllObligations < 0
    ? 'critical'
    : cashAvailable < totalObligationsThisPeriod
    ? 'warning'
    : 'ok'

  const recommendationSummary =
    recommendationLevel === 'critical'
      ? `Aun con los próximos ingresos, las obligaciones (incluye ${overduePaymentCount} pagos vencidos por ${Math.round(
          overduePaymentTotal
        )} y ${criticalLiabilities.length} obligaciones críticas) superan el efectivo proyectado. Revisa promesas de pago o mueve obligaciones.`
      : recommendationLevel === 'warning'
      ? `El efectivo disponible hoy no cubre todos los compromisos críticos. Hay ${overduePaymentCount} pagos vencidos y ${criticalLiabilities.length} obligaciones críticas. Prioriza Honda/Toyota y pagos pendientes antes de pagos extra.`
      : 'Los próximos ingresos cubren las obligaciones registradas. Evita pagos extra hasta cubrir compromisos críticos.'

  return {
    cashAvailable,
    currentBankBalances,
    creditAvailable,
    connectedCreditDebt,
    totalCreditCardDebt,
    pendingPaymentInstances,
    totalPendingPayments,
    upcomingIncome,
    unpaidCriticalLiabilities: criticalLiabilities,
    totalCriticalLiabilityPayments,
    totalObligationsThisPeriod,
    shortfallToday,
    projectedCashAfterIncome,
    projectedCashAfterAllObligations,
    recommendationLevel,
    recommendationSummary,
    attentionItems,
  }
}
