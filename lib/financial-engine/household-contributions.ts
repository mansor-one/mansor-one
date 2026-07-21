import { getFinancialEngineSnapshot, type FinancialEngineSnapshot } from './snapshot'
import type {
  FinancialSupabaseClient,
  IncomeSchedule,
  PaymentInstance,
} from './types'
import { paymentCountsAsUnpaidRisk } from '../finance/paymentLifecycle.ts'

export type HouseholdPerson = 'manuel' | 'soraya'
export type HouseholdOwner = HouseholdPerson | 'household' | 'unknown'

export type HouseholdContributionScenario =
  | 'responsibility'
  | 'proportional'
  | 'hybrid'

export type HouseholdIncomeEvent = {
  id: string
  owner: HouseholdOwner
  name: string
  amount: number
  expectedDate: string
  incomeType: 'paycheck' | 'recurring' | 'one_time' | 'windfall' | 'other'
  confidence: 'estimated' | 'likely' | 'confirmed'
  destinationAccount?: string | null
}

export type ContributionAssignment = {
  person: HouseholdPerson
  incomeEventId: string
  incomeAmount: number
  requiredContribution: number
  optionalDebtContribution: number
  totalToSeparate: number
  transferToHouseholdAccount: number
  remainingAfterContribution: number
  coveredPayments: {
    paymentId: string
    name: string
    amountCovered: number
    dueDate: string
    owner: string | null
    priority: 'critical' | 'required' | 'optional'
  }[]
  explanation: string[]
}

export type HouseholdContributionPlan = {
  generatedAt: string
  horizonStart: string
  horizonEnd: string
  availableHouseholdCash: number
  incomingIncomeTotal: number
  requiredPaymentsTotal: number
  uncoveredRequiredAmount: number
  manuel: ContributionAssignment[]
  soraya: ContributionAssignment[]
  householdSummary: {
    totalToSeparate: number
    totalRemaining: number
    fullyCovered: boolean
    criticalPaymentsCovered: boolean
  }
  assumptions: string[]
  warnings: string[]
}

export type HouseholdContributionScenarioPlan = HouseholdContributionPlan & {
  scenario: HouseholdContributionScenario
  scenarioTitle: string
  recommended: boolean
  recommendationReason: string
  protectedCashReserve: number
  safeExtraDebtAmount: number
  planningFundsAvailable: number
  uncoveredPayments: ContributionPayment[]
  incomeEvents: HouseholdIncomeEvent[]
}

export type HouseholdContributionPlannerResult = {
  generatedAt: string
  selectedScenario: HouseholdContributionScenario
  recommendedScenario: HouseholdContributionScenario
  plans: HouseholdContributionScenarioPlan[]
}

export type TemporaryContributionIncomeInput = {
  owner: HouseholdOwner
  name?: string
  amount?: number
  expectedDate?: string
  incomeType?: HouseholdIncomeEvent['incomeType']
  confidence?: HouseholdIncomeEvent['confidence']
}

export type HouseholdContributionPlannerOptions = {
  horizonDays?: 7 | 14 | 30
  selectedScenario?: HouseholdContributionScenario
  temporaryIncome?: TemporaryContributionIncomeInput[]
  asOf?: Date
}

export type ContributionPayment = {
  paymentId: string
  name: string
  amount: number
  remainingAmount: number
  dueDate: string
  owner: HouseholdOwner
  originalOwner: string | null
  priority: 'critical' | 'required' | 'optional'
  isCardMinimum: boolean
  hasGracePeriod: boolean
  isInGracePeriod: boolean
  isOverdue: boolean
  notes: string[]
}

type PaymentTarget = {
  payment: ContributionPayment
  person: HouseholdPerson
  amount: number
  support: boolean
}

type AllocationState = {
  assignments: Record<HouseholdPerson, ContributionAssignment[]>
  unallocatedTargets: PaymentTarget[]
}

const PEOPLE: HouseholdPerson[] = ['manuel', 'soraya']

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function numberValue(value: unknown) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value: number) {
  return `$${numberValue(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function normalizeOwner(value: unknown): HouseholdOwner {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (normalized.includes('manuel')) return 'manuel'
  if (normalized.includes('soraya')) return 'soraya'
  if (
    normalized.includes('household') ||
    normalized.includes('familia') ||
    normalized.includes('shared') ||
    normalized.includes('hogar')
  ) {
    return 'household'
  }

  return 'unknown'
}

function incomeConfidence(income: IncomeSchedule): HouseholdIncomeEvent['confidence'] {
  if (income.confidence === 'confirmed') return 'confirmed'
  if (income.confidence === 'likely') return 'likely'
  return income.amount_is_estimated ? 'estimated' : 'likely'
}

function incomeType(
  income: IncomeSchedule
): HouseholdIncomeEvent['incomeType'] {
  const raw = String(
    income.income_type || income.cadence || income.category_code || income.name || ''
  ).toLowerCase()

  if (raw.includes('paycheck') || raw.includes('payroll') || raw.includes('nomina')) {
    return 'paycheck'
  }
  if (
    raw.includes('tax') ||
    raw.includes('relief') ||
    raw.includes('severance') ||
    raw.includes('bonus') ||
    raw.includes('windfall')
  ) {
    return 'windfall'
  }
  if (raw.includes('one_time') || raw.includes('one time')) return 'one_time'
  if (income.income_type === 'recurring' || income.cadence !== 'one_time') {
    return 'recurring'
  }

  return 'other'
}

function incomeEventFromSchedule(income: IncomeSchedule): HouseholdIncomeEvent | null {
  const amount = numberValue(income.amount)
  const expectedDate = income.next_expected_date?.slice(0, 10)

  if (!income.id || amount <= 0 || !expectedDate) return null

  return {
    id: income.id,
    owner: normalizeOwner(income.owner_scope || income.owner),
    name: income.name || 'Income',
    amount,
    expectedDate,
    incomeType: incomeType(income),
    confidence: incomeConfidence(income),
    destinationAccount: income.destination_account_id || null,
  }
}

function temporaryIncomeEvent(
  input: TemporaryContributionIncomeInput,
  index: number
): HouseholdIncomeEvent | null {
  const amount = numberValue(input.amount)
  if (amount <= 0 || !input.expectedDate) return null

  return {
    id: `temporary:${index}:${input.owner}:${input.expectedDate}`,
    owner: input.owner,
    name: input.name || 'Temporary scenario income',
    amount,
    expectedDate: input.expectedDate,
    incomeType: input.incomeType || 'other',
    confidence: input.confidence || 'likely',
    destinationAccount: null,
  }
}

function incomeEventsForHorizon({
  snapshot,
  horizonStart,
  horizonEnd,
  temporaryIncome = [],
}: {
  snapshot: FinancialEngineSnapshot
  horizonStart: string
  horizonEnd: string
  temporaryIncome?: TemporaryContributionIncomeInput[]
}) {
  const liveIncome = snapshot.projectedIncome
    .map(incomeEventFromSchedule)
    .filter((event): event is HouseholdIncomeEvent => event !== null)
  const temporary = temporaryIncome
    .map(temporaryIncomeEvent)
    .filter((event): event is HouseholdIncomeEvent => event !== null)

  return [...liveIncome, ...temporary]
    .filter(
      (event) =>
        event.expectedDate >= horizonStart && event.expectedDate <= horizonEnd
    )
    .sort((left, right) => {
      if (left.expectedDate === right.expectedDate) {
        return left.name.localeCompare(right.name)
      }
      return left.expectedDate.localeCompare(right.expectedDate)
    })
}

function effectivePaymentDate(payment: PaymentInstance) {
  return (
    payment.effective_due_date ||
    payment.grace_until ||
    payment.grace_due_date ||
    payment.due_date ||
    payment.expected_date ||
    null
  )?.slice(0, 10) || null
}

function paymentPriority(payment: PaymentInstance): ContributionPayment['priority'] {
  if (payment.isOverdue || payment.lifecycleState === 'overdue') return 'critical'
  return 'required'
}

function contributionPaymentFromLifecycle(
  payment: PaymentInstance
): ContributionPayment | null {
  const amount = numberValue(payment.amount)
  const dueDate = effectivePaymentDate(payment)

  if (!paymentCountsAsUnpaidRisk(payment) || amount <= 0 || !dueDate) return null

  const hasGracePeriod = Boolean(
    payment.grace_until || payment.grace_due_date || numberValue(payment.grace_days) > 0
  )
  const isCardMinimum = payment.lifecycleItemType === 'card_payment'

  return {
    paymentId: payment.id,
    name: payment.name || 'Payment',
    amount,
    remainingAmount: amount,
    dueDate,
    owner: normalizeOwner(payment.owner),
    originalOwner: payment.owner || null,
    priority: paymentPriority(payment),
    isCardMinimum,
    hasGracePeriod,
    isInGracePeriod: payment.isInGracePeriod === true,
    isOverdue: payment.isOverdue === true || payment.lifecycleState === 'overdue',
    notes: [
      payment.lifecycleLabel ? `Lifecycle: ${payment.lifecycleLabel}` : null,
      hasGracePeriod
        ? `Grace through ${payment.grace_until || payment.grace_due_date}`
        : 'No grace period detected',
      isCardMinimum ? 'Credit-card minimum payment' : null,
    ].filter((item): item is string => item !== null),
  }
}

function sortContributionPayments(
  payments: ContributionPayment[],
  nextIncomeDate: string | null
) {
  return [...payments].sort((left, right) => {
    const leftScore = paymentSortScore(left, nextIncomeDate)
    const rightScore = paymentSortScore(right, nextIncomeDate)
    if (leftScore !== rightScore) return rightScore - leftScore
    if (left.dueDate !== right.dueDate) return left.dueDate.localeCompare(right.dueDate)
    return right.amount - left.amount
  })
}

function paymentSortScore(payment: ContributionPayment, nextIncomeDate: string | null) {
  let score = 0
  if (payment.isOverdue) score += 100
  if (nextIncomeDate && payment.dueDate < nextIncomeDate) score += 50
  if (!payment.hasGracePeriod) score += 25
  if (payment.isInGracePeriod) score += 15
  if (payment.isCardMinimum) score += 10
  return score
}

function paymentsForHorizon({
  snapshot,
  horizonStart,
  horizonEnd,
  incomeEvents,
}: {
  snapshot: FinancialEngineSnapshot
  horizonStart: string
  horizonEnd: string
  incomeEvents: HouseholdIncomeEvent[]
}) {
  const nextIncomeDate = incomeEvents.find((event) => event.expectedDate >= horizonStart)
    ?.expectedDate || null

  const payments = snapshot.lifecyclePayments
    .map(contributionPaymentFromLifecycle)
    .filter((payment): payment is ContributionPayment => payment !== null)
    .filter(
      (payment) => payment.dueDate >= horizonStart && payment.dueDate <= horizonEnd
    )

  return sortContributionPayments(payments, nextIncomeDate)
}

function applyAvailableCash(
  payments: ContributionPayment[],
  availableHouseholdCash: number
) {
  let cashRemaining = Math.max(0, availableHouseholdCash)

  return payments.map((payment) => {
    const cashCoverage = Math.min(cashRemaining, payment.amount)
    cashRemaining -= cashCoverage

    return {
      ...payment,
      remainingAmount: Math.max(0, payment.amount - cashCoverage),
    }
  })
}

function incomeTotalsByPerson(incomeEvents: HouseholdIncomeEvent[]) {
  const totals: Record<HouseholdPerson, number> = { manuel: 0, soraya: 0 }

  incomeEvents.forEach((event) => {
    if (event.owner === 'manuel' || event.owner === 'soraya') {
      totals[event.owner] += event.amount
    } else {
      totals.manuel += event.amount / 2
      totals.soraya += event.amount / 2
    }
  })

  return totals
}

function proportionalShares(incomeEvents: HouseholdIncomeEvent[]) {
  const totals = incomeTotalsByPerson(incomeEvents)
  const combined = totals.manuel + totals.soraya

  if (combined <= 0) return { manuel: 0.5, soraya: 0.5 }

  return {
    manuel: totals.manuel / combined,
    soraya: totals.soraya / combined,
  }
}

function targetPersonForOwner(owner: HouseholdOwner): HouseholdPerson | null {
  if (owner === 'manuel' || owner === 'soraya') return owner
  return null
}

function paymentTargetsForScenario({
  scenario,
  payments,
  incomeEvents,
}: {
  scenario: HouseholdContributionScenario
  payments: ContributionPayment[]
  incomeEvents: HouseholdIncomeEvent[]
}): PaymentTarget[] {
  const shares = proportionalShares(incomeEvents)
  const targets: PaymentTarget[] = []

  payments
    .filter((payment) => payment.remainingAmount > 0)
    .forEach((payment) => {
      const personalOwner = targetPersonForOwner(payment.owner)

      if (scenario === 'responsibility') {
        if (personalOwner) {
          targets.push({
            payment,
            person: personalOwner,
            amount: payment.remainingAmount,
            support: false,
          })
        } else {
          PEOPLE.forEach((person) => {
            targets.push({
              payment,
              person,
              amount: payment.remainingAmount / 2,
              support: false,
            })
          })
        }
        return
      }

      if (scenario === 'proportional' || !personalOwner) {
        PEOPLE.forEach((person) => {
          targets.push({
            payment,
            person,
            amount: payment.remainingAmount * shares[person],
            support: false,
          })
        })
        return
      }

      targets.push({
        payment,
        person: personalOwner,
        amount: payment.remainingAmount,
        support: false,
      })
    })

  return targets.filter((target) => target.amount > 0.004)
}

function emptyAssignments(
  incomeEvents: HouseholdIncomeEvent[]
): Record<HouseholdPerson, ContributionAssignment[]> {
  return {
    manuel: incomeEvents.flatMap((event) =>
      assignmentsForPersonIncome('manuel', event)
    ),
    soraya: incomeEvents.flatMap((event) =>
      assignmentsForPersonIncome('soraya', event)
    ),
  }
}

function assignmentsForPersonIncome(
  person: HouseholdPerson,
  event: HouseholdIncomeEvent
) {
  if (event.owner === person) {
    return [assignmentForIncome(person, event)]
  }

  if (event.owner === 'household' || event.owner === 'unknown') {
    return [
      assignmentForIncome(person, {
        ...event,
        id: `${event.id}:${person}-share`,
        amount: event.amount / 2,
        name: `${event.name} (${person} planning share)`,
      }),
    ]
  }

  return []
}

function assignmentForIncome(
  person: HouseholdPerson,
  event: HouseholdIncomeEvent
): ContributionAssignment {
  return {
    person,
    incomeEventId: event.id,
    incomeAmount: event.amount,
    requiredContribution: 0,
    optionalDebtContribution: 0,
    totalToSeparate: 0,
    transferToHouseholdAccount: 0,
    remainingAfterContribution: event.amount,
    coveredPayments: [],
    explanation: [
      `${event.name} expected ${event.expectedDate} with ${event.confidence} confidence.`,
    ],
  }
}

function capacity(assignment: ContributionAssignment) {
  return Math.max(
    0,
    assignment.incomeAmount -
      assignment.requiredContribution -
      assignment.optionalDebtContribution
  )
}

function addCoverage({
  assignment,
  target,
  amount,
}: {
  assignment: ContributionAssignment
  target: PaymentTarget
  amount: number
}) {
  assignment.requiredContribution += amount
  assignment.totalToSeparate =
    assignment.requiredContribution + assignment.optionalDebtContribution
  assignment.remainingAfterContribution =
    assignment.incomeAmount - assignment.totalToSeparate

  if (
    target.payment.owner === 'household' ||
    target.payment.owner === 'unknown' ||
    target.payment.owner !== assignment.person ||
    target.support
  ) {
    assignment.transferToHouseholdAccount += amount
  }

  const existing = assignment.coveredPayments.find(
    (payment) => payment.paymentId === target.payment.paymentId
  )

  if (existing) {
    existing.amountCovered += amount
  } else {
    assignment.coveredPayments.push({
      paymentId: target.payment.paymentId,
      name: target.payment.name,
      amountCovered: amount,
      dueDate: target.payment.dueDate,
      owner: target.payment.originalOwner,
      priority: target.payment.priority,
    })
  }
}

function allocateTargets({
  assignments,
  targets,
}: {
  assignments: Record<HouseholdPerson, ContributionAssignment[]>
  targets: PaymentTarget[]
}): AllocationState {
  const unallocatedTargets: PaymentTarget[] = []

  targets.forEach((target) => {
    let remaining = target.amount
    const personAssignments = assignments[target.person]

    for (const assignment of personAssignments) {
      const amount = Math.min(capacity(assignment), remaining)
      if (amount <= 0) continue

      addCoverage({ assignment, target, amount })
      remaining -= amount
      if (remaining <= 0.004) break
    }

    if (remaining > 0.004) {
      unallocatedTargets.push({ ...target, amount: remaining })
    }
  })

  return { assignments, unallocatedTargets }
}

function allocateOptionalHybridSupport(state: AllocationState) {
  const stillUnallocated: PaymentTarget[] = []

  state.unallocatedTargets.forEach((target) => {
    let remaining = target.amount
    const supportPerson: HouseholdPerson =
      target.person === 'manuel' ? 'soraya' : 'manuel'

    for (const assignment of state.assignments[supportPerson]) {
      const amount = Math.min(capacity(assignment), remaining)
      if (amount <= 0) continue

      addCoverage({
        assignment,
        target: { ...target, person: supportPerson, support: true },
        amount,
      })
      assignment.explanation.push(
        `Includes ${money(amount)} of optional household support for ${target.payment.name}.`
      )
      remaining -= amount
      if (remaining <= 0.004) break
    }

    if (remaining > 0.004) {
      stillUnallocated.push({ ...target, amount: remaining })
    }
  })

  state.unallocatedTargets = stillUnallocated
  return state
}

function addOptionalDebtContribution({
  assignments,
  requiredFullyCovered,
  protectedCashReserve,
}: {
  assignments: Record<HouseholdPerson, ContributionAssignment[]>
  requiredFullyCovered: boolean
  protectedCashReserve: number
}) {
  if (!requiredFullyCovered) return 0

  let protectedRemaining = protectedCashReserve
  let safeExtraDebtAmount = 0

  const windfallAssignments = PEOPLE.flatMap((person) => assignments[person])
    .filter((assignment) => assignment.incomeEventId.startsWith('temporary:'))

  windfallAssignments.forEach((assignment) => {
    const available = capacity(assignment)
    if (available <= 0) return

    const protectedFromThisIncome = Math.min(available, protectedRemaining)
    protectedRemaining -= protectedFromThisIncome
    const extraDebt = Math.max(0, available - protectedFromThisIncome)

    assignment.optionalDebtContribution = extraDebt
    assignment.totalToSeparate =
      assignment.requiredContribution + assignment.optionalDebtContribution
    assignment.remainingAfterContribution =
      assignment.incomeAmount - assignment.totalToSeparate

    if (extraDebt > 0) {
      assignment.explanation.push(
        `${money(extraDebt)} can be reviewed as safe extra debt money after required payments and protected cash.`
      )
    }

    safeExtraDebtAmount += extraDebt
  })

  return safeExtraDebtAmount
}

function roundAssignment(assignment: ContributionAssignment) {
  assignment.requiredContribution = roundMoney(assignment.requiredContribution)
  assignment.optionalDebtContribution = roundMoney(assignment.optionalDebtContribution)
  assignment.totalToSeparate = roundMoney(assignment.totalToSeparate)
  assignment.transferToHouseholdAccount = roundMoney(
    assignment.transferToHouseholdAccount
  )
  assignment.remainingAfterContribution = roundMoney(
    assignment.remainingAfterContribution
  )
  assignment.coveredPayments = assignment.coveredPayments.map((payment) => ({
    ...payment,
    amountCovered: roundMoney(payment.amountCovered),
  }))

  if (assignment.requiredContribution > assignment.incomeAmount) {
    assignment.explanation.push(
      'This income event is not enough to cover its assigned payment share.'
    )
  }

  return assignment
}

function roundMoney(value: number) {
  return Math.round(numberValue(value) * 100) / 100
}

function scenarioTitle(scenario: HouseholdContributionScenario) {
  if (scenario === 'responsibility') return 'Responsibility-based'
  if (scenario === 'proportional') return 'Proportional-income'
  return 'Hybrid'
}

function scenarioReason({
  scenario,
  incomeEvents,
  warnings,
}: {
  scenario: HouseholdContributionScenario
  incomeEvents: HouseholdIncomeEvent[]
  warnings: string[]
}) {
  if (scenario === 'hybrid') {
    if (warnings.some((warning) => warning.includes('owner'))) {
      return 'Hybrid is shown, but weak owner metadata limits confidence.'
    }
    if (incomeEvents.some((event) => event.owner === 'manuel' || event.owner === 'soraya')) {
      return 'Hybrid respects personal obligations first and splits shared needs by available income.'
    }
    return 'Hybrid is available, but income ownership is incomplete.'
  }

  if (scenario === 'responsibility') {
    return 'Assigns personal obligations to their owner and splits shared or unknown obligations evenly.'
  }

  return 'Splits the remaining required amount by each person’s share of income in the horizon.'
}

function buildWarnings({
  incomeEvents,
  payments,
}: {
  incomeEvents: HouseholdIncomeEvent[]
  payments: ContributionPayment[]
}) {
  const warnings: string[] = []

  if (!incomeEvents.length) {
    warnings.push('No expected income was found inside the selected horizon.')
  }
  if (incomeEvents.some((event) => event.owner === 'unknown')) {
    warnings.push('Some income has unknown owner metadata and is not assigned to Manuel or Soraya.')
  }
  if (incomeEvents.some((event) => event.confidence === 'estimated')) {
    warnings.push('Some income is estimated, so contribution amounts should be reviewed before moving money.')
  }
  if (payments.some((payment) => payment.owner === 'unknown')) {
    warnings.push('Some payments have unknown owner metadata and are treated as shared household responsibility.')
  }
  if (payments.some((payment) => !payment.dueDate)) {
    warnings.push('Some payments are missing due dates and cannot be allocated safely.')
  }

  return warnings
}

function buildAssumptions({
  horizonDays,
  availableHouseholdCash,
}: {
  horizonDays: number
  availableHouseholdCash: number
}) {
  return [
    `Default planner horizon is ${horizonDays} days.`,
    `Existing usable household cash of ${money(availableHouseholdCash)} is reserved before assigning new income.`,
    'The planner recommends only; it does not move money, mark bills paid, or create transfers.',
    'Shared or unknown-owner payments are household responsibilities until a clearer owner model exists.',
    'Optional debt money is shown only after required payments are covered and protected cash is reserved.',
  ]
}

function buildScenarioPlan({
  scenario,
  recommendedScenario,
  horizonStart,
  horizonEnd,
  availableHouseholdCash,
  incomeEvents,
  payments,
  horizonDays,
}: {
  scenario: HouseholdContributionScenario
  recommendedScenario: HouseholdContributionScenario
  horizonStart: string
  horizonEnd: string
  availableHouseholdCash: number
  incomeEvents: HouseholdIncomeEvent[]
  payments: ContributionPayment[]
  horizonDays: number
}): HouseholdContributionScenarioPlan {
  const requiredPaymentsTotal = payments.reduce(
    (sum, payment) => sum + payment.amount,
    0
  )
  const requiredAfterCash = payments.reduce(
    (sum, payment) => sum + payment.remainingAmount,
    0
  )
  const incomingIncomeTotal = incomeEvents.reduce(
    (sum, event) => sum + event.amount,
    0
  )
  const warnings = buildWarnings({ incomeEvents, payments })
  const assignments = emptyAssignments(incomeEvents)
  const targets = paymentTargetsForScenario({ scenario, payments, incomeEvents })
  let state = allocateTargets({ assignments, targets })

  if (scenario === 'hybrid') {
    state = allocateOptionalHybridSupport(state)
  }

  const uncoveredRequiredAmount = roundMoney(
    state.unallocatedTargets.reduce((sum, target) => sum + target.amount, 0)
  )
  const requiredFullyCovered = uncoveredRequiredAmount <= 0
  const protectedCashReserve = requiredFullyCovered
    ? roundMoney(Math.max(500, requiredPaymentsTotal * 0.1))
    : 0
  const safeExtraDebtAmount = roundMoney(
    addOptionalDebtContribution({
      assignments: state.assignments,
      requiredFullyCovered,
      protectedCashReserve,
    })
  )

  const manuel = state.assignments.manuel.map(roundAssignment)
  const soraya = state.assignments.soraya.map(roundAssignment)
  const allAssignments = [...manuel, ...soraya]
  const totalToSeparate = roundMoney(
    allAssignments.reduce((sum, assignment) => sum + assignment.totalToSeparate, 0)
  )
  const totalRemaining = roundMoney(
    allAssignments.reduce(
      (sum, assignment) => sum + assignment.remainingAfterContribution,
      0
    )
  )
  const criticalUncovered = state.unallocatedTargets.some(
    (target) => target.payment.priority === 'critical'
  )

  return {
    scenario,
    scenarioTitle: scenarioTitle(scenario),
    recommended: scenario === recommendedScenario,
    recommendationReason: scenarioReason({ scenario, incomeEvents, warnings }),
    generatedAt: new Date().toISOString(),
    horizonStart,
    horizonEnd,
    availableHouseholdCash: roundMoney(availableHouseholdCash),
    incomingIncomeTotal: roundMoney(incomingIncomeTotal),
    requiredPaymentsTotal: roundMoney(requiredPaymentsTotal),
    uncoveredRequiredAmount,
    manuel,
    soraya,
    householdSummary: {
      totalToSeparate,
      totalRemaining,
      fullyCovered: requiredFullyCovered,
      criticalPaymentsCovered: !criticalUncovered,
    },
    protectedCashReserve,
    safeExtraDebtAmount,
    planningFundsAvailable: requiredFullyCovered
      ? roundMoney(Math.max(0, totalRemaining - protectedCashReserve - safeExtraDebtAmount))
      : 0,
    uncoveredPayments: summarizeUncoveredPayments(state.unallocatedTargets),
    incomeEvents,
    assumptions: [
      ...buildAssumptions({ horizonDays, availableHouseholdCash }),
      `Required payments still needing income after existing cash: ${money(requiredAfterCash)}.`,
    ],
    warnings: [
      ...warnings,
      ...state.unallocatedTargets.map(
        (target) =>
          `${target.payment.name} still has ${money(target.amount)} uncovered in ${scenarioTitle(
            scenario
          )}.`
      ),
    ],
  }
}

function summarizeUncoveredPayments(targets: PaymentTarget[]) {
  const byPayment = new Map<string, ContributionPayment>()

  targets.forEach((target) => {
    const current = byPayment.get(target.payment.paymentId)
    byPayment.set(target.payment.paymentId, {
      ...target.payment,
      remainingAmount: roundMoney((current?.remainingAmount || 0) + target.amount),
    })
  })

  return [...byPayment.values()]
}

function recommendedScenarioFor({
  incomeEvents,
  payments,
}: {
  incomeEvents: HouseholdIncomeEvent[]
  payments: ContributionPayment[]
}): HouseholdContributionScenario {
  const hasPersonalSignals = payments.some(
    (payment) => payment.owner === 'manuel' || payment.owner === 'soraya'
  )
  const hasIncomeOwners = incomeEvents.some(
    (event) => event.owner === 'manuel' || event.owner === 'soraya'
  )

  if (hasPersonalSignals && hasIncomeOwners) return 'hybrid'
  if (hasIncomeOwners) return 'proportional'
  return 'responsibility'
}

export function buildHouseholdContributionPlannerFromSnapshot(
  snapshot: FinancialEngineSnapshot,
  options: HouseholdContributionPlannerOptions = {}
): HouseholdContributionPlannerResult {
  const horizonDays = options.horizonDays || 14
  const asOf = options.asOf || new Date()
  const horizonStart = isoDate(asOf)
  const horizonEnd = isoDate(addDays(asOf, horizonDays))
  const incomeEvents = incomeEventsForHorizon({
    snapshot,
    horizonStart,
    horizonEnd,
    temporaryIncome: options.temporaryIncome,
  })
  const rawPayments = paymentsForHorizon({
    snapshot,
    horizonStart,
    horizonEnd,
    incomeEvents,
  })
  const payments = applyAvailableCash(
    rawPayments,
    snapshot.portfolio.totalLiquidAvailable
  )
  const recommendedScenario = recommendedScenarioFor({
    incomeEvents,
    payments,
  })
  const selectedScenario = options.selectedScenario || recommendedScenario
  const scenarios: HouseholdContributionScenario[] = [
    'responsibility',
    'proportional',
    'hybrid',
  ]

  return {
    generatedAt: new Date().toISOString(),
    selectedScenario,
    recommendedScenario,
    plans: scenarios.map((scenario) =>
      buildScenarioPlan({
        scenario,
        recommendedScenario,
        horizonStart,
        horizonEnd,
        availableHouseholdCash: snapshot.portfolio.totalLiquidAvailable,
        incomeEvents,
        payments,
        horizonDays,
      })
    ),
  }
}

export async function getHouseholdContributionPlanner(
  supabase: FinancialSupabaseClient,
  userId: string,
  options: HouseholdContributionPlannerOptions = {}
) {
  const snapshot = await getFinancialEngineSnapshot(supabase, userId)
  return buildHouseholdContributionPlannerFromSnapshot(snapshot, options)
}
