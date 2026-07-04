import {
  friendlyLifecyclePaymentNotes,
  lifecyclePaymentDueDate,
  lifecyclePaymentGraceUntilDate,
} from '@/lib/finance/lifecycleDisplay'
import { getDashboardSummary } from './dashboard'
import type {
  FinancialSupabaseClient,
  IncomeSchedule,
  PaymentInstance,
} from './types'

export type TimelineProjectionEvent = {
  date: string
  title: string
  amount: number
  type: 'income' | 'payment'
  status: string
  notes: string
  dueDate: string
  graceUntilDate: string | null
  isInGracePeriod: boolean
  balanceAfter: number
}

export type TimelineProjectionSummary = {
  startingCash: number
  finalBalance: number
  minimumBalance: number
  events: TimelineProjectionEvent[]
  explanation: {
    initialCash: {
      balance: number
      connectedCash: number
      manualCash: number
      text: string
    }
    lowestPoint: {
      date: string | null
      balance: number
      payments: TimelineProjectionEvent[]
      incomeEvents: TimelineProjectionEvent[]
      text: string
    }
    finalBalance: {
      balance: number
      totalIncome: number
      totalPayments: number
      openCommitmentsCount: number
      incomeEventsCount: number
      text: string
    }
  }
}

function incomeEvent(income: IncomeSchedule) {
  if (!income.next_expected_date || !income.amount) return null

  return {
    date: income.next_expected_date,
    title: income.name || 'Ingreso',
    amount: Number(income.amount || 0),
    type: 'income' as const,
    status: 'confirmed',
    notes: '',
    dueDate: income.next_expected_date,
    graceUntilDate: null,
    isInGracePeriod: false,
  }
}

function paymentEvent(payment: PaymentInstance) {
  if (payment.lifecycleIsOpen === false || !payment.effective_due_date) {
    return null
  }

  return {
    date: payment.effective_due_date,
    title: payment.name || 'Pago',
    amount: -Number(payment.amount || 0),
    type: 'payment' as const,
    status: payment.lifecycleLabel || payment.status || 'pending',
    notes: friendlyLifecyclePaymentNotes(payment) || '',
    dueDate:
      lifecyclePaymentDueDate(payment) || payment.effective_due_date,
    graceUntilDate: lifecyclePaymentGraceUntilDate(payment),
    isInGracePeriod: payment.isInGracePeriod === true,
  }
}

function sortEvents(
  left: Omit<TimelineProjectionEvent, 'balanceAfter'>,
  right: Omit<TimelineProjectionEvent, 'balanceAfter'>
) {
  if (left.date === right.date) return right.amount - left.amount
  return left.date.localeCompare(right.date)
}

export async function getTimelineProjection(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<TimelineProjectionSummary> {
  const { liquidity } = await getDashboardSummary(supabase, userId)
  const startingCash = liquidity.cashAvailableTotal
  const rawEvents = [
    ...(liquidity.projectedIncome || [])
      .map(incomeEvent)
      .filter((event): event is NonNullable<typeof event> => event !== null),
    ...(liquidity.lifecyclePayments || [])
      .map(paymentEvent)
      .filter((event): event is NonNullable<typeof event> => event !== null),
  ].sort(sortEvents)

  let runningBalance = startingCash
  const events = rawEvents.map((event) => {
    runningBalance += event.amount

    return {
      ...event,
      balanceAfter: runningBalance,
    }
  })

  const lowestEvent = events.reduce<TimelineProjectionEvent | null>(
    (lowest, event) => {
      if (!lowest || event.balanceAfter < lowest.balanceAfter) return event
      return lowest
    },
    null
  )
  const minimumBalance = lowestEvent?.balanceAfter ?? startingCash
  const lowestDate = lowestEvent?.date || null
  const lowestDateEvents = lowestDate
    ? events.filter((event) => event.date === lowestDate)
    : []
  const lowestPayments = lowestDateEvents.filter(
    (event) => event.type === 'payment'
  )
  const lowestIncomeEvents = lowestDateEvents.filter(
    (event) => event.type === 'income'
  )
  const totalIncome = events
    .filter((event) => event.type === 'income')
    .reduce((sum, event) => sum + event.amount, 0)
  const totalPayments = Math.abs(
    events
      .filter((event) => event.type === 'payment')
      .reduce((sum, event) => sum + event.amount, 0)
  )

  return {
    startingCash,
    finalBalance: runningBalance,
    minimumBalance,
    events,
    explanation: {
      initialCash: {
        balance: startingCash,
        connectedCash: liquidity.cashAvailablePlaid,
        manualCash: liquidity.cashAvailableManual,
        text:
          'Starts from Financial Engine usable cash, not raw bank balance.',
      },
      lowestPoint: {
        date: lowestDate,
        balance: minimumBalance,
        payments: lowestPayments,
        incomeEvents: lowestIncomeEvents,
        text: lowestDate
          ? 'This is the lowest projected balance after applying loaded events on that date.'
          : 'No projected events are currently loaded.',
      },
      finalBalance: {
        balance: runningBalance,
        totalIncome,
        totalPayments,
        openCommitmentsCount: events.filter(
          (event) => event.type === 'payment'
        ).length,
        incomeEventsCount: events.filter((event) => event.type === 'income')
          .length,
        text:
          'Final projection equals initial usable cash plus loaded income minus open commitments.',
      },
    },
  }
}
