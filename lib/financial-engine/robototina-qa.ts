import type { RobototinaContext } from './robototina-context'
import type { MansorDecision } from './decision-engine-v1'
import type { PaymentInstance } from './types'

export type RobototinaQaConfidence = 'low' | 'medium' | 'high'

export type RobototinaQaActionLink = {
  label: string
  href: string
}

export type RobototinaQaResponse = {
  answer: string
  supportingFacts: string[]
  confidence: RobototinaQaConfidence
  actionLinks: RobototinaQaActionLink[]
  limitations: string[]
  matchedIntent:
    | 'pay_today'
    | 'wait_on_payment'
    | 'weekly_risk'
    | 'expected_income'
    | 'overdue_payments'
    | 'stale_accounts'
    | 'review_queue'
    | 'protect_cash'
    | 'general'
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function paymentName(payment: PaymentInstance) {
  return payment.name || 'Payment'
}

function paymentDate(payment: PaymentInstance) {
  return payment.effective_due_date || payment.due_date || payment.grace_until || null
}

function paymentFact(payment: PaymentInstance) {
  const date = paymentDate(payment)
  return `${paymentName(payment)}: $${money(payment.amount)}${date ? ` on ${date}` : ''}`
}

function decisionFacts(decision: MansorDecision | undefined) {
  return decision?.evidence?.slice(0, 4) ?? []
}

function topActionableDecision(context: RobototinaContext) {
  return context.decisions.find((decision) =>
    ['pay_now', 'warning', 'review_needed', 'planning', 'wait'].includes(decision.type)
  )
}

function actionLink(label: string, href: string): RobototinaQaActionLink {
  return { label, href }
}

function findPaymentByQuestion(question: string, context: RobototinaContext) {
  const normalizedQuestion = normalize(question)
  return context.liquidity.openPayments.find((payment) => {
    const name = normalize(paymentName(payment))
    return name.length > 0 && normalizedQuestion.includes(name)
  }) || context.liquidity.openPayments.find((payment) => {
    const name = normalize(paymentName(payment))
    return name
      .split(/\s+/)
      .filter((part) => part.length >= 4)
      .some((part) => normalizedQuestion.includes(part))
  })
}

function paymentDecision(payment: PaymentInstance | undefined, context: RobototinaContext) {
  if (!payment) return undefined
  const paymentId = String(payment.id || '')
  const normalizedName = normalize(paymentName(payment))

  return context.decisions.find((decision) =>
    decision.id.includes(paymentId) || normalize(decision.title).includes(normalizedName)
  )
}

function answerPayToday(context: RobototinaContext): RobototinaQaResponse {
  const payNow = context.decisions.filter((decision) => decision.type === 'pay_now')
  const decisions = payNow.length > 0 ? payNow : context.decisions.slice(0, 3)

  if (decisions.length === 0) {
    return {
      answer:
        'I do not see a payment that the Decision Engine is asking you to handle today.',
      supportingFacts: [
        `Open payments: ${context.liquidity.openPaymentsCount}`,
        `Lowest projected balance: $${money(context.timeline.lowestPointBalance)}`,
      ],
      confidence: 'medium',
      actionLinks: [actionLink('View payments', '/timeline#payments')],
      limitations: ['This answer only uses the current Financial Engine snapshot.'],
      matchedIntent: 'pay_today',
    }
  }

  const first = decisions[0]
  const names = decisions.slice(0, 3).map((decision) => decision.title).join('; ')

  return {
    answer: `Start with: ${names}. ${first.recommendation}`,
    supportingFacts: decisions.flatMap(decisionFacts).slice(0, 6),
    confidence: first.confidence,
    actionLinks: [actionLink(first.actionLabel, first.actionHref), actionLink('View payments', '/timeline#payments')],
    limitations: [],
    matchedIntent: 'pay_today',
  }
}

function answerWaitOnPayment(question: string, context: RobototinaContext): RobototinaQaResponse {
  const payment = findPaymentByQuestion(question, context)
  const decision = paymentDecision(payment, context)

  if (!payment) {
    return {
      answer:
        'I could not match that payment in the open lifecycle payments. Check the timeline before deciding.',
      supportingFacts: [`Open payments: ${context.liquidity.openPaymentsCount}`],
      confidence: 'low',
      actionLinks: [actionLink('View payments', '/timeline#payments')],
      limitations: ['I need the payment name to match an official lifecycle payment.'],
      matchedIntent: 'wait_on_payment',
    }
  }

  if (decision?.type === 'wait') {
    return {
      answer: `Yes, waiting looks reasonable for ${paymentName(payment)} if you still pay before the stated deadline. ${decision.recommendation}`,
      supportingFacts: decisionFacts(decision),
      confidence: decision.confidence,
      actionLinks: [actionLink(decision.actionLabel, decision.actionHref)],
      limitations: [],
      matchedIntent: 'wait_on_payment',
    }
  }

  if (payment.isOverdue || decision?.type === 'pay_now') {
    return {
      answer: `I would not wait on ${paymentName(payment)}. The official decision is to handle it now or confirm it if it was already paid.`,
      supportingFacts: decisionFacts(decision).length ? decisionFacts(decision) : [paymentFact(payment)],
      confidence: decision?.confidence ?? 'medium',
      actionLinks: [actionLink(decision?.actionLabel || 'Review payment', decision?.actionHref || '/timeline#payments')],
      limitations: [],
      matchedIntent: 'wait_on_payment',
    }
  }

  if (payment.isInGracePeriod) {
    return {
      answer: `${paymentName(payment)} appears to be inside a grace period. Waiting may be acceptable, but keep the grace deadline visible.`,
      supportingFacts: [
        paymentFact(payment),
        `Grace until: ${payment.grace_until || payment.grace_due_date || 'configured grace date'}`,
      ],
      confidence: 'medium',
      actionLinks: [actionLink('View timeline', '/timeline#payments')],
      limitations: ['I do not see a stronger wait/pay-now decision for this payment.'],
      matchedIntent: 'wait_on_payment',
    }
  }

  return {
    answer: `${paymentName(payment)} is open, but I do not see a clear wait signal. Keep cash protected until the timeline and expected income are reviewed.`,
    supportingFacts: [paymentFact(payment)],
    confidence: 'medium',
    actionLinks: [actionLink('View timeline', '/timeline#payments')],
    limitations: ['No specific Decision Engine wait rule matched this payment.'],
    matchedIntent: 'wait_on_payment',
  }
}

function answerWeeklyRisk(context: RobototinaContext): RobototinaQaResponse {
  const critical = context.decisions.find((decision) => decision.severity === 'critical')
  const riskDecision = critical || context.decisions.find((decision) => decision.severity === 'warning')

  if (riskDecision) {
    return {
      answer: `The biggest risk is: ${riskDecision.title}. ${riskDecision.explanation}`,
      supportingFacts: decisionFacts(riskDecision),
      confidence: riskDecision.confidence,
      actionLinks: [actionLink(riskDecision.actionLabel, riskDecision.actionHref)],
      limitations: [],
      matchedIntent: 'weekly_risk',
    }
  }

  return {
    answer: `The main thing to watch is the projected low point: $${money(context.timeline.lowestPointBalance)}${context.timeline.lowestPointDate ? ` on ${context.timeline.lowestPointDate}` : ''}.`,
    supportingFacts: [
      `Lowest projected balance: $${money(context.timeline.lowestPointBalance)}`,
      `Open payments: $${money(context.liquidity.openPaymentsTotal)}`,
    ],
    confidence: 'medium',
    actionLinks: [actionLink('View timeline', '/timeline#lowest-point')],
    limitations: [],
    matchedIntent: 'weekly_risk',
  }
}

function answerExpectedIncome(context: RobototinaContext): RobototinaQaResponse {
  if (context.liquidity.projectedIncomeTotal <= 0) {
    return {
      answer:
        'I do not see expected income in the current snapshot, so I would avoid decisions that depend on money arriving this week.',
      supportingFacts: [
        `Expected income: $${money(context.liquidity.projectedIncomeTotal)}`,
        `Result after income: $${money(context.liquidity.resultAfterIncome)}`,
      ],
      confidence: 'high',
      actionLinks: [actionLink('View income', '/income#expected-income')],
      limitations: [],
      matchedIntent: 'expected_income',
    }
  }

  return {
    answer: `Expected income improves the projection by $${money(context.liquidity.projectedIncomeTotal)}. After that income, the engine projects $${money(context.liquidity.resultAfterIncome)} after open obligations.`,
    supportingFacts: context.liquidity.projectedIncome.slice(0, 3).map((income) =>
      `${income.name || 'Expected income'}: $${money(income.amount)} on ${income.next_expected_date || 'date not set'}`
    ),
    confidence: 'medium',
    actionLinks: [actionLink('View income', '/income#expected-income'), actionLink('View timeline', '/timeline#projection')],
    limitations: ['Projected or estimated income can still change until it is received.'],
    matchedIntent: 'expected_income',
  }
}

function answerOverduePayments(context: RobototinaContext): RobototinaQaResponse {
  const overdue = context.liquidity.openPayments.filter((payment) => payment.isOverdue)

  if (overdue.length === 0) {
    return {
      answer: 'I do not see overdue open payments in the current Robototina context.',
      supportingFacts: [`Open payments: ${context.liquidity.openPaymentsCount}`],
      confidence: 'high',
      actionLinks: [actionLink('View payments', '/timeline#payments')],
      limitations: [],
      matchedIntent: 'overdue_payments',
    }
  }

  return {
    answer: `I see ${overdue.length} overdue payment${overdue.length === 1 ? '' : 's'}: ${overdue.map(paymentName).join(', ')}.`,
    supportingFacts: overdue.slice(0, 5).map(paymentFact),
    confidence: 'high',
    actionLinks: [actionLink('Review overdue payments', '/timeline#payments')],
    limitations: [],
    matchedIntent: 'overdue_payments',
  }
}

function answerStaleAccounts(context: RobototinaContext): RobototinaQaResponse {
  const stale = context.liquidity.staleAccountWarnings

  if (stale.length === 0) {
    return {
      answer: 'I do not see stale account warnings in the current snapshot.',
      supportingFacts: ['No stale account warnings returned by Robototina context.'],
      confidence: 'high',
      actionLinks: [actionLink('View portfolio', '/portfolio#plaid-connections')],
      limitations: [],
      matchedIntent: 'stale_accounts',
    }
  }

  return {
    answer: `${stale.length} account${stale.length === 1 ? '' : 's'} may need a sync before major cash decisions.`,
    supportingFacts: stale.slice(0, 5).map((account) =>
      `${account.label}: ${account.ageHours === null ? 'no sync timestamp' : `${account.ageHours} hours old`}`
    ),
    confidence: 'high',
    actionLinks: [actionLink('Sync or review accounts', '/portfolio#plaid-connections')],
    limitations: [],
    matchedIntent: 'stale_accounts',
  }
}

function answerReviewQueue(context: RobototinaContext): RobototinaQaResponse {
  const review = context.reviewQueue

  if (review.pendingCount === 0) {
    return {
      answer: 'There is nothing in the review queue that Robototina is asking you to handle right now.',
      supportingFacts: ['Pending review items: 0'],
      confidence: 'high',
      actionLinks: [actionLink('Open review queue', '/lab/review-queue#queue')],
      limitations: [],
      matchedIntent: 'review_queue',
    }
  }

  return {
    answer: `Review ${review.pendingCount} item${review.pendingCount === 1 ? '' : 's'} that could affect data quality, duplicate risk, or confirmations.`,
    supportingFacts: [
      `Ready to confirm: ${review.readyToConfirmCount}`,
      `Needs category: ${review.needsCategoryCount}`,
      `Possible duplicates: ${review.possibleDuplicateCount}`,
      `ATH review: ${review.athReviewCount}`,
    ],
    confidence: 'high',
    actionLinks: [actionLink('Open review queue', '/lab/review-queue#queue')],
    limitations: [],
    matchedIntent: 'review_queue',
  }
}

function answerProtectCash(context: RobototinaContext): RobototinaQaResponse {
  const topDecision = topActionableDecision(context)
  const openPayments = context.liquidity.openPayments.slice(0, 4)

  return {
    answer: `Protect cash for open obligations first. The engine sees $${money(context.liquidity.openPaymentsTotal)} in open payments and a projected low point of $${money(context.timeline.lowestPointBalance)}.`,
    supportingFacts: [
      ...openPayments.map(paymentFact),
      ...(topDecision ? [`Top recommendation: ${topDecision.title}`] : []),
    ].slice(0, 6),
    confidence: topDecision?.confidence ?? 'medium',
    actionLinks: [
      actionLink('View payments', '/timeline#payments'),
      actionLink('View projection', '/timeline#lowest-point'),
    ],
    limitations: [],
    matchedIntent: 'protect_cash',
  }
}

export function answerRobototinaQuestion(
  question: string,
  context: RobototinaContext
): RobototinaQaResponse {
  const q = normalize(question)

  if (
    q.includes('pay today') ||
    q.includes('pagar hoy') ||
    q.includes('pago hoy') ||
    q.includes('que pago primero') ||
    q.includes('what should i pay')
  ) {
    return answerPayToday(context)
  }

  if (
    q.includes('can i wait') ||
    q.includes('puedo esperar') ||
    q.includes('esperar') ||
    q.includes('wait on')
  ) {
    return answerWaitOnPayment(question, context)
  }

  if (
    q.includes('biggest risk') ||
    q.includes('mayor riesgo') ||
    q.includes('riesgo') ||
    q.includes('this week') ||
    q.includes('esta semana')
  ) {
    return answerWeeklyRisk(context)
  }

  if (
    q.includes('expected income') ||
    q.includes('income arrives') ||
    q.includes('ingreso') ||
    q.includes('cuando cobre') ||
    q.includes('si llega')
  ) {
    return answerExpectedIncome(context)
  }

  if (q.includes('overdue') || q.includes('vencid')) {
    return answerOverduePayments(context)
  }

  if (q.includes('stale') || q.includes('sync') || q.includes('cuentas atrasadas')) {
    return answerStaleAccounts(context)
  }

  if (q.includes('review') || q.includes('revisar') || q.includes('cola')) {
    return answerReviewQueue(context)
  }

  if (
    q.includes('protect cash') ||
    q.includes('cash') ||
    q.includes('proteger efectivo') ||
    q.includes('reservar')
  ) {
    return answerProtectCash(context)
  }

  const decision = topActionableDecision(context)
  if (decision) {
    return {
      answer: `${decision.title}. ${decision.recommendation}`,
      supportingFacts: decisionFacts(decision),
      confidence: decision.confidence,
      actionLinks: [actionLink(decision.actionLabel, decision.actionHref)],
      limitations: [
        'I matched this as a general question. Try asking about payments, income, risk, stale accounts, or review items for a sharper answer.',
      ],
      matchedIntent: 'general',
    }
  }

  return {
    answer:
      'I can answer questions about what to pay, whether to wait, this week’s risk, expected income, stale accounts, review items, and what cash to protect.',
    supportingFacts: [`Generated at: ${context.generatedAt}`],
    confidence: 'low',
    actionLinks: [actionLink('Open Robototina', '/robototina')],
    limitations: ['No matching Decision Engine recommendation was available.'],
    matchedIntent: 'general',
  }
}
