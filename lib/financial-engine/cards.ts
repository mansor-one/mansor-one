import { getResolvedAccounts } from './account-resolver'
import {
  getLiquiditySummary,
  paymentMatchesSchedule,
} from './liquidity'
import type {
  CardProfile,
  CardsSummary,
  ConnectedAccount,
  CreditCard,
  FinancialSupabaseClient,
  PaymentInstance,
  PersonOption,
  ResolvedConnectedAccount,
  ScheduledPayment,
} from './types'

type CardMatch = {
  account: ResolvedConnectedAccount
  confidence: number
}

type ScheduleMatch = {
  schedule: ScheduledPayment
  confidence: number
  reasons: string[]
}

const CLOSED_PAYMENT_STATUSES = new Set(['paid', 'confirmed', 'closed'])
const DUE_SOON_DAYS = 7
const CARD_ALIASES: Record<string, string[]> = {
  'POPULAR VISA': ['VISA PREMIA REWARDS', 'BANCO POPULAR', 'POPULAR'],
  'VISA PREMIA REWARDS': ['POPULAR VISA', 'BANCO POPULAR', 'POPULAR'],
  'US BANK': ['U S BANK', 'CREDIT CARD 4910', 'CARD 4910'],
  'U S BANK': ['US BANK', 'CREDIT CARD 4910', 'CARD 4910'],
  'CREDIT CARD 4910': ['US BANK', 'U S BANK'],
  SYNCHRONY: ['SYNCHRONY'],
}

function numberValue(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null

  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalize(value: string | null | undefined) {
  return String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' AND ')
    .replace(/[._-]/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\bBANCO\b/g, ' ')
    .replace(/\bPUERTO RICO\b/g, ' ')
    .replace(/\bCREDIT CARD\b/g, 'CARD')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string | null | undefined) {
  return new Set(
    normalize(value)
      .split(' ')
      .filter((token) => token.length >= 3)
  )
}

function tokenOverlap(left: string | null | undefined, right: string | null | undefined) {
  const leftTokens = tokens(left)
  const rightTokens = tokens(right)
  let overlap = 0

  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlap += 1
  })

  return overlap
}

function includesEither(left: string, right: string) {
  return Boolean(left && right && (left.includes(right) || right.includes(left)))
}

function aliasesFor(value: string | null | undefined) {
  const normalized = normalize(value)
  const aliases = new Set<string>([normalized])

  Object.entries(CARD_ALIASES).forEach(([key, values]) => {
    if (normalized.includes(key) || values.some((alias) => normalized.includes(alias))) {
      aliases.add(key)
      values.forEach((alias) => aliases.add(alias))
    }
  })

  return [...aliases].filter(Boolean)
}

function aliasesOverlap(left: string | null | undefined, right: string | null | undefined) {
  const leftAliases = aliasesFor(left)
  const rightAliases = aliasesFor(right)

  return leftAliases.some((leftAlias) =>
    rightAliases.some((rightAlias) => includesEither(leftAlias, rightAlias))
  )
}

function scheduleDayMatches(cardDueDay: number | null, schedule: ScheduledPayment) {
  if (!cardDueDay || !schedule.due_day) return false

  return Number(cardDueDay) === Number(schedule.due_day)
}

function isPopularVisa(manual: CreditCard, account: ConnectedAccount) {
  const manualSignal = normalize(`${manual.bank || ''} ${manual.name || ''}`)
  const accountSignal = normalize(
    `${account.institution_name || ''} ${account.name || ''}`
  )

  return (
    manualSignal.includes('POPULAR') &&
    manualSignal.includes('VISA') &&
    accountSignal.includes('POPULAR') &&
    (accountSignal.includes('VISA') || accountSignal.includes('PREMIA'))
  )
}

function isUsBankCard(manual: CreditCard, account: ConnectedAccount) {
  const manualSignal = normalize(`${manual.bank || ''} ${manual.name || ''}`)
  const accountSignal = normalize(
    `${account.institution_name || ''} ${account.name || ''}`
  )

  return (
    manualSignal.includes('US BANK') &&
    (accountSignal.includes('US BANK') || accountSignal.includes('U S BANK'))
  )
}

function manualPlaidConfidence(manual: CreditCard, account: ConnectedAccount) {
  const manualName = normalize(manual.name)
  const manualBank = normalize(manual.bank)
  const accountName = normalize(account.name)
  const institution = normalize(account.institution_name)
  let score = 0

  if (manualBank && institution && includesEither(manualBank, institution)) {
    score += 45
  }

  if (manualName && accountName && includesEither(manualName, accountName)) {
    score += 35
  }

  score += Math.min(tokenOverlap(manual.name, account.name) * 12, 24)
  score += Math.min(tokenOverlap(manual.bank, account.institution_name) * 15, 30)

  if (isPopularVisa(manual, account)) score = Math.max(score, 95)
  if (isUsBankCard(manual, account)) score = Math.max(score, 90)

  return Math.min(score, 100)
}

function bestPlaidMatch(
  manual: CreditCard,
  accounts: ResolvedConnectedAccount[],
  usedAccountIds: Set<string>
): CardMatch | null {
  if (manual.plaid_account_id) {
    const directMatch = accounts.find(
      (account) => account.id === manual.plaid_account_id
    )

    if (directMatch && !usedAccountIds.has(directMatch.id || '')) {
      return { account: directMatch, confidence: 100 }
    }
  }

  const matches = accounts
    .filter((account) => !usedAccountIds.has(account.id || ''))
    .map((account) => ({
      account,
      confidence: manualPlaidConfidence(manual, account),
    }))
    .filter((match) => match.confidence >= 80)
    .sort((a, b) => b.confidence - a.confidence)

  return matches[0] || null
}

function scheduleScore(
  profileName: string,
  institution: string | null,
  schedule: ScheduledPayment,
  dueDay: number | null
) {
  const scheduleName = normalize(schedule.name)
  const name = normalize(profileName)
  const institutionName = normalize(institution)
  const combinedProfile = `${profileName} ${institution || ''}`
  const combinedSchedule = `${schedule.name || ''} ${schedule.category || ''}`
  const reasons: string[] = []
  let score = 0

  if (name && scheduleName && includesEither(name, scheduleName)) {
    score += 60
    reasons.push('Card name and schedule name overlap.')
  }

  if (aliasesOverlap(combinedProfile, combinedSchedule)) {
    score += 55
    reasons.push('Known card alias matches schedule.')
  }

  if (scheduleDayMatches(dueDay, schedule)) {
    score += 15
    reasons.push('Card due day matches schedule due day.')
  }

  const overlap = tokenOverlap(profileName, schedule.name)
  if (overlap > 0) {
    const overlapScore = Math.min(overlap * 18, 36)
    score += overlapScore
    reasons.push('Card and schedule share name tokens.')
  }

  if (
    scheduleName.includes('POPULAR VISA') &&
    institutionName.includes('POPULAR')
  ) {
    score = Math.max(score, 90)
    reasons.push('Popular Visa / Banco Popular alias rule matched.')
  }

  if (scheduleName.includes('US BANK') && institutionName.includes('US BANK')) {
    score = Math.max(score, 90)
    reasons.push('US Bank institution alias rule matched.')
  }

  if (scheduleName.includes('SYNCHRONY') && institutionName.includes('SYNCHRONY')) {
    score = Math.max(score, 90)
    reasons.push('Synchrony institution alias rule matched.')
  }

  if (reasons.length === 0) {
    reasons.push('No alias, institution, due-day, or name-token match.')
  }

  return {
    confidence: Math.min(score, 100),
    reasons,
  }
}

function bestScheduleMatch(
  profileName: string,
  institution: string | null,
  dueDay: number | null,
  schedules: ScheduledPayment[],
  usedScheduleIds: Set<string>,
  manual?: CreditCard | null
): ScheduleMatch | null {
  if (manual?.scheduled_payment_id) {
    const directMatch = schedules.find(
      (schedule) => schedule.id === manual.scheduled_payment_id
    )

    if (directMatch && !usedScheduleIds.has(directMatch.id)) {
      return {
        schedule: directMatch,
        confidence: 100,
        reasons: ['Manual card has a direct scheduled payment link.'],
      }
    }
  }

  if (manual?.id) {
    const directCardMatch = schedules.find(
      (schedule) => schedule.credit_card_id === manual.id
    )

    if (directCardMatch && !usedScheduleIds.has(directCardMatch.id)) {
      return {
        schedule: directCardMatch,
        confidence: 100,
        reasons: ['Scheduled payment is linked to this card profile.'],
      }
    }
  }

  const matches = schedules
    .filter((schedule) => !usedScheduleIds.has(schedule.id))
    .map((schedule) => ({
      schedule,
      ...scheduleScore(profileName, institution, schedule, dueDay),
    }))
    .filter((match) => match.confidence >= 70)
    .sort((a, b) => b.confidence - a.confidence)

  return matches[0] || null
}

function scheduleDiagnostics({
  selectedMatch,
  profileName,
  institution,
  dueDay,
  schedules,
}: {
  selectedMatch: ScheduleMatch | null
  profileName: string
  institution: string | null
  dueDay: number | null
  schedules: ScheduledPayment[]
}) {
  if (selectedMatch) {
    return [
      `Linked to ${selectedMatch.schedule.name} (${selectedMatch.confidence}%): ${selectedMatch.reasons.join(
        ' '
      )}`,
    ]
  }

  if (schedules.length === 0) {
    return ['No active scheduled payments are available to match.']
  }

  const bestAttempt = schedules
    .map((schedule) => ({
      schedule,
      ...scheduleScore(profileName, institution, schedule, dueDay),
    }))
    .sort((a, b) => b.confidence - a.confidence)[0]

  if (!bestAttempt) return ['No schedule candidate was evaluated.']

  return [
    `No schedule linked. Best candidate was ${bestAttempt.schedule.name} (${bestAttempt.confidence}%).`,
    ...bestAttempt.reasons,
  ]
}

function manualDuplicateIds(manual: CreditCard, manualCards: CreditCard[]) {
  const manualId = manual.id || ''
  const plaidAccountId = manual.plaid_account_id || null
  const manualSignal = normalize(`${manual.bank || ''} ${manual.name || ''}`)

  return manualCards
    .filter((candidate) => candidate.id && candidate.id !== manualId)
    .filter((candidate) => {
      if (
        plaidAccountId &&
        candidate.plaid_account_id &&
        candidate.plaid_account_id === plaidAccountId
      ) {
        return true
      }

      const candidateSignal = normalize(
        `${candidate.bank || ''} ${candidate.name || ''}`
      )

      return Boolean(manualSignal && candidateSignal === manualSignal)
    })
    .map((candidate) => candidate.id || '')
    .filter(Boolean)
}

function nextOpenLifecyclePayment(
  schedule: ScheduledPayment | null,
  payments: PaymentInstance[]
) {
  if (!schedule) return null

  return (
    payments.find(
      (payment) =>
        payment.lifecycleIsOpen !== false &&
        paymentMatchesSchedule(payment, schedule)
    ) ||
    null
  )
}

function lifecyclePaymentStatus(payment: PaymentInstance | null, today: Date) {
  if (!payment) return null

  if (payment.lifecycleState === 'closed') return 'paid'
  if (payment.lifecycleState === 'overdue') return 'overdue'

  const status = normalize(payment.status).toLowerCase()
  const dueDate = payment.effective_due_date
    ? new Date(`${payment.effective_due_date}T00:00:00`)
    : null

  if (status === 'initiated' || payment.lifecycleState === 'detected') {
    return 'initiated'
  }

  if (dueDate) {
    const daysUntilDue = Math.ceil(
      (dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
    )

    if (daysUntilDue <= DUE_SOON_DAYS) return 'dueSoon'

    return 'upcoming'
  }

  return 'upcoming'
}

function lastPaidPayment(
  schedule: ScheduledPayment | null,
  payments: PaymentInstance[]
) {
  if (!schedule) return null

  return payments
    .filter((payment) => paymentMatchesSchedule(payment, schedule))
    .filter((payment) => CLOSED_PAYMENT_STATUSES.has(normalize(payment.status).toLowerCase()))
    .sort((a, b) =>
      String(b.effective_due_date || '').localeCompare(
        String(a.effective_due_date || '')
      )
    )[0] || null
}

function utilizationPercent(balance: number | null, creditLimit: number | null) {
  if (!balance || !creditLimit || creditLimit <= 0) return null

  return Math.round((balance / creditLimit) * 100)
}

function dateOnly(value: string | null | undefined) {
  if (!value) return null

  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isFinite(date.getTime()) ? date : null
}

function daysUntilDate(dateValue: string | null | undefined, today: Date) {
  const date = dateOnly(dateValue)
  if (!date) return null

  return Math.ceil((date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
}

function isPromoNote(value: string | null | undefined) {
  const normalized = normalize(value)
  return (
    normalized.includes('0%') ||
    normalized.includes('PROMO') ||
    normalized.includes('PROMOTIONAL')
  )
}

function regularAprNote(value: string | null | undefined) {
  if (!value || isPromoNote(value)) return null

  return value
}

function promoAprNote(value: string | null | undefined) {
  if (!value || !isPromoNote(value)) return null

  return value
}

function missingDataChecklist({
  owner,
  manual,
  schedule,
}: {
  owner: string | null
  manual: CreditCard | null
  schedule: ScheduledPayment | null
}) {
  const missing: string[] = []
  const interestNotes = manual?.interest_notes || null

  if (!owner) missing.push('owner')
  if (numberValue(manual?.regular_apr) === null && !regularAprNote(interestNotes)) {
    missing.push('APR')
  }
  if (numberValue(manual?.promo_apr) === null && !promoAprNote(interestNotes)) {
    missing.push('promo APR')
  }
  if (!manual?.promo_end_date) missing.push('promo end date')
  if (!schedule?.due_day && !manual?.due_day) missing.push('due day')
  if (numberValue(manual?.minimum_payment) === null && !schedule?.amount) {
    missing.push('minimum payment')
  }
  if (manual?.autopay_enabled === null || manual?.autopay_enabled === undefined) {
    missing.push('autopay')
  }
  if (!schedule) missing.push('schedule')

  return missing
}

function profileWarnings({
  manual,
  account,
  schedule,
  creditLimit,
  duplicateIds,
  owner,
  daysUntilPromoEnd,
}: {
  manual: CreditCard | null
  account: ResolvedConnectedAccount | null
  schedule: ScheduledPayment | null
  creditLimit: number | null
  duplicateIds: string[]
  owner: string | null
  daysUntilPromoEnd: number | null
}) {
  const warnings: string[] = []

  if (!schedule) warnings.push('No payment schedule')
  if (!owner) warnings.push('Missing owner')
  if (!account) warnings.push('Not connected to Plaid')
  if (duplicateIds.length > 0) warnings.push('Duplicate manual profile')
  if (!creditLimit || creditLimit <= 0) warnings.push('Missing credit limit')
  if (!schedule?.due_day && !manual?.due_day) warnings.push('Missing due date')
  if (manual?.is_active === false && account) {
    warnings.push('Inactive manual record with active Plaid match')
  }
  if (
    daysUntilPromoEnd !== null &&
    daysUntilPromoEnd >= 0 &&
    daysUntilPromoEnd <= 60
  ) {
    warnings.push('Promo ends within 60 days')
  }

  return warnings
}

function sourceForProfile(
  manual: CreditCard | null,
  account: ResolvedConnectedAccount | null
): CardProfile['source'] {
  if (manual && account) return 'merged'
  if (account) return 'plaid'
  return 'manual'
}

function buildProfile({
  manual,
  account,
  schedule,
  payments,
  duplicateIds,
  scheduleLinkDiagnostics,
  linkConfidence,
  today,
  peopleById,
}: {
  manual: CreditCard | null
  account: ResolvedConnectedAccount | null
  schedule: ScheduledPayment | null
  payments: PaymentInstance[]
  duplicateIds: string[]
  scheduleLinkDiagnostics: string[]
  linkConfidence: number
  today: Date
  peopleById: Map<string, string>
}): CardProfile {
  const currentPayment = nextOpenLifecyclePayment(schedule, payments)
  const paidPayment = lastPaidPayment(schedule, payments)
  const manualBalance = numberValue(manual?.balance)
  const plaidBalance = numberValue(account?.current_balance)
  const plaidAvailable = numberValue(account?.available_balance)
  const manualLimit = numberValue(manual?.credit_limit)
  const currentBalance = plaidBalance ?? manualBalance
  const creditLimit =
    manualLimit ??
    (plaidBalance !== null && plaidAvailable !== null
      ? plaidBalance + plaidAvailable
      : null)
  const availableCredit =
    plaidAvailable ??
    (creditLimit !== null && currentBalance !== null
      ? Math.max(creditLimit - currentBalance, 0)
      : null)
  const dueDay =
    schedule?.due_day ??
    manual?.due_day ??
    null
  const manualOwner =
    manual?.owner_id && peopleById.has(manual.owner_id)
      ? peopleById.get(manual.owner_id) || null
      : null
  const owner = manualOwner || currentPayment?.owner || schedule?.owner || null
  const daysUntilPromoEnd = daysUntilDate(manual?.promo_end_date, today)
  const warnings = profileWarnings({
    manual,
    account,
    schedule,
    creditLimit,
    duplicateIds,
    owner,
    daysUntilPromoEnd,
  })

  return {
    id: [
      manual?.id ? `manual:${manual.id}` : null,
      account?.id ? `plaid:${account.id}` : null,
    ]
      .filter(Boolean)
      .join('|') || `card:${manual?.name || account?.name || 'unknown'}`,
    displayName: manual?.name || account?.name || schedule?.name || 'Card',
    institution: account?.institution_name || manual?.bank || null,
    owner,
    ownerId: manual?.owner_id || null,
    source: sourceForProfile(manual, account),
    manualCreditCardId: manual?.id || null,
    plaidAccountId: account?.id || null,
    plaidAccountName: account?.name || null,
    manualPlaidAccountId: manual?.plaid_account_id || null,
    scheduledPaymentId: schedule?.id || null,
    manualScheduledPaymentId: manual?.scheduled_payment_id || null,
    currentPaymentInstanceId:
      currentPayment?.source === 'payment_instance' ? currentPayment.id : null,
    currentPaymentSource: currentPayment?.source || null,
    currentBalance,
    availableCredit,
    creditLimit,
    utilizationPercent: utilizationPercent(currentBalance, creditLimit),
    minimumPayment:
      numberValue(currentPayment?.amount) ??
      numberValue(manual?.minimum_payment) ??
      numberValue(schedule?.amount),
    dueDay,
    nextDueDate: currentPayment?.effective_due_date || null,
    paymentStatus: lifecyclePaymentStatus(currentPayment, today),
    lastPaymentDate: paidPayment?.effective_due_date || null,
    interestNotes: manual?.interest_notes || null,
    regularAprNote: regularAprNote(manual?.interest_notes),
    promoAprNote: promoAprNote(manual?.interest_notes),
    regularApr: numberValue(manual?.regular_apr),
    promoApr: numberValue(manual?.promo_apr),
    promoEndDate: manual?.promo_end_date || null,
    autopayEnabled: manual?.autopay_enabled ?? null,
    autopayAccountLabel: manual?.autopay_account_label || null,
    paymentAccountNotes: manual?.payment_account_notes || null,
    manualLast4: manual?.manual_last4 || null,
    cardType: manual?.card_type || null,
    useCase: manual?.use_case || null,
    cutoffDay: manual?.cutoff_day || null,
    daysUntilPromoEnd,
    promoEndingSoon:
      daysUntilPromoEnd !== null &&
      daysUntilPromoEnd >= 0 &&
      daysUntilPromoEnd <= 60,
    isActive: Boolean(account) || (manual ? manual.is_active !== false : true),
    isConnected: Boolean(account),
    warnings,
    scheduleLinkDiagnostics,
    missingDataChecklist: missingDataChecklist({
      owner,
      manual,
      schedule,
    }),
    linkConfidence,
    duplicatePlaidAccountIds: duplicateIds,
  }
}

async function getAllCreditCards(
  supabase: FinancialSupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from('credit_cards')
    .select('*')
    .eq('user_id', userId)
    .order('balance', { ascending: false })

  if (error) throw error

  return (data || []) as CreditCard[]
}

async function getActiveScheduledPayments(supabase: FinancialSupabaseClient) {
  const { data, error } = await supabase
    .from('scheduled_payments')
    .select('*')
    .eq('is_active', true)

  if (error) throw error

  return (data || []) as ScheduledPayment[]
}

async function getPeople(supabase: FinancialSupabaseClient) {
  const { data, error } = await supabase
    .from('people')
    .select('id, name')
    .order('name', { ascending: true })

  if (error) return []

  return (data || []) as PersonOption[]
}

function profileNeedsAttention(profile: CardProfile) {
  return profile.warnings.length > 0
}

function sortCards(cards: CardProfile[]) {
  return [...cards].sort((a, b) => {
    if (b.warnings.length !== a.warnings.length) {
      return b.warnings.length - a.warnings.length
    }

    return Number(b.currentBalance || 0) - Number(a.currentBalance || 0)
  })
}

export async function getCardsSummary(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<CardsSummary> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    manualCards,
    { resolvedAccounts },
    schedules,
    liquidity,
    ownerOptions,
  ] = await Promise.all([
    getAllCreditCards(supabase, userId),
    getResolvedAccounts(supabase, userId),
    getActiveScheduledPayments(supabase),
    getLiquiditySummary(supabase, userId),
    getPeople(supabase),
  ])
  const payments = liquidity.lifecyclePayments
  const peopleById = new Map(
    ownerOptions.map((person) => [person.id, person.name])
  )
  const plaidCreditAccounts = resolvedAccounts.filter(
    (account) => account.type === 'credit'
  )
  const usedPlaidIds = new Set<string>()
  const usedScheduleIds = new Set<string>()
  const profiles: CardProfile[] = []

  manualCards.forEach((manual) => {
    const plaidMatch = bestPlaidMatch(manual, plaidCreditAccounts, usedPlaidIds)
    const account = plaidMatch?.account || null

    if (account?.id) usedPlaidIds.add(account.id)

    const scheduleMatch = bestScheduleMatch(
      manual.name || account?.name || '',
      account?.institution_name || manual.bank || null,
      manual.due_day || null,
      schedules,
      usedScheduleIds,
      manual
    )
    const diagnosticProfileName = manual.name || account?.name || ''
    const diagnosticInstitution = account?.institution_name || manual.bank || null
    if (scheduleMatch?.schedule.id) usedScheduleIds.add(scheduleMatch.schedule.id)

    profiles.push(
      buildProfile({
        manual,
        account,
        schedule: scheduleMatch?.schedule || null,
        payments,
        duplicateIds: manualDuplicateIds(manual, manualCards),
        scheduleLinkDiagnostics: scheduleDiagnostics({
          selectedMatch: scheduleMatch,
          profileName: diagnosticProfileName,
          institution: diagnosticInstitution,
          dueDay: manual.due_day || null,
          schedules,
        }),
        linkConfidence: plaidMatch?.confidence || scheduleMatch?.confidence || 0,
        today,
        peopleById,
      })
    )
  })

  plaidCreditAccounts
    .filter((account) => !usedPlaidIds.has(account.id || ''))
    .forEach((account) => {
      const scheduleMatch = bestScheduleMatch(
        account.name || '',
        account.institution_name || null,
        null,
        schedules,
        usedScheduleIds
      )
      if (scheduleMatch?.schedule.id) {
        usedScheduleIds.add(scheduleMatch.schedule.id)
      }

      profiles.push(
        buildProfile({
          manual: null,
          account,
          schedule: scheduleMatch?.schedule || null,
          payments,
          duplicateIds: [],
          scheduleLinkDiagnostics: scheduleDiagnostics({
            selectedMatch: scheduleMatch,
            profileName: account.name || '',
            institution: account.institution_name || null,
            dueDay: null,
            schedules,
          }),
          linkConfidence: scheduleMatch?.confidence || 0,
          today,
          peopleById,
        })
      )
    })

  const cards = sortCards(profiles)

  return {
    cards,
    attentionNeeded: cards.filter(profileNeedsAttention),
    activeCards: cards.filter((card) => card.isActive),
    connectedCards: cards.filter((card) => card.isConnected),
    archivedCards: cards.filter((card) => !card.isActive && !card.isConnected),
    ownerOptions,
    unresolvedCards: cards.filter(
      (card) => !card.manualCreditCardId || !card.plaidAccountId || !card.scheduledPaymentId
    ),
    totalBalance: cards.reduce(
      (sum, card) => sum + Number(card.currentBalance || 0),
      0
    ),
    totalAvailableCredit: cards.reduce(
      (sum, card) => sum + Number(card.availableCredit || 0),
      0
    ),
    totalMinimumPayment: cards.reduce(
      (sum, card) => sum + Number(card.minimumPayment || 0),
      0
    ),
    warnings: [...new Set(cards.flatMap((card) => card.warnings))],
  }
}
