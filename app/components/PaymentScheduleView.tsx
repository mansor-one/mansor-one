'use client'

import {
  friendlyLifecyclePaymentNotes,
  lifecyclePaymentDueDate,
  lifecyclePaymentGraceDays,
  lifecyclePaymentGraceUntilDate,
} from '@/lib/finance/lifecycleDisplay'
import type { PaymentInstance } from '@/lib/financial-engine'
import { useMemo, useState } from 'react'

type ViewMode = 'calendar' | 'list'

const weekdayLabels = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']

const monthFormatter = new Intl.DateTimeFormat('es-PR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function money(value: unknown) {
  return `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function dateKey(value: string | null | undefined) {
  if (!value) return null

  return value.slice(0, 10)
}

function dateTime(value: string | null | undefined) {
  const key = dateKey(value)
  if (!key) return null

  const time = new Date(`${key}T00:00:00Z`).getTime()
  return Number.isFinite(time) ? time : null
}

function paymentDate(payment: PaymentInstance) {
  return dateKey(lifecyclePaymentDueDate(payment) || payment.effective_due_date)
}

function paymentMonthKey(payment: PaymentInstance) {
  const dueDate = paymentDate(payment)
  if (!dueDate) return null

  return dueDate.slice(0, 7)
}

function formatShortDate(value: string | null | undefined) {
  const key = dateKey(value)
  if (!key) return 'Sin fecha'

  const [year, month, day] = key.split('-')
  return `${month}/${day}/${year}`
}

function formatMonthLabel(monthKey: string) {
  return monthFormatter
    .format(new Date(`${monthKey}-01T00:00:00Z`))
    .replace(/^\p{Ll}/u, (letter) => letter.toUpperCase())
}

function calendarDays(monthKey: string) {
  const [yearText, monthText] = monthKey.split('-')
  const year = Number(yearText)
  const monthIndex = Number(monthText) - 1
  const firstDay = new Date(Date.UTC(year, monthIndex, 1))
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const leadingEmptyDays = firstDay.getUTCDay()

  return [
    ...Array.from({ length: leadingEmptyDays }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]
}

function sortPayments(payments: PaymentInstance[]) {
  return payments.slice().sort((a, b) => {
    const dateCompare = String(paymentDate(a) || '').localeCompare(
      String(paymentDate(b) || '')
    )
    if (dateCompare !== 0) return dateCompare

    return String(a.name || '').localeCompare(String(b.name || ''))
  })
}

function paymentHasGraceWindow(payment: PaymentInstance) {
  const dueTime = dateTime(paymentDate(payment))
  const graceTime = dateTime(lifecyclePaymentGraceUntilDate(payment))

  return Boolean(dueTime !== null && graceTime !== null && graceTime > dueTime)
}

function paymentIsInGraceWindowOnDate(payment: PaymentInstance, date: string) {
  const dueTime = dateTime(paymentDate(payment))
  const graceTime = dateTime(lifecyclePaymentGraceUntilDate(payment))
  const targetTime = dateTime(date)

  return Boolean(
    dueTime !== null &&
      graceTime !== null &&
      targetTime !== null &&
      targetTime > dueTime &&
      targetTime <= graceTime
  )
}

function statusLabel(payment: PaymentInstance) {
  return payment.lifecycleLabel || payment.status || 'pending'
}

function statusClasses(payment: PaymentInstance) {
  if (payment.lifecycleIsClosed || payment.lifecycleState === 'closed') {
    return 'border-emerald-800 bg-emerald-950/50 text-emerald-100'
  }

  if (payment.isOverdue || payment.lifecycleState === 'overdue') {
    return 'border-red-800 bg-red-950/50 text-red-100'
  }

  if (payment.isInGracePeriod || payment.lifecycleState === 'grace') {
    return 'border-amber-800 bg-amber-950/50 text-amber-100'
  }

  if (payment.status === 'initiated' || payment.lifecycleState === 'detected') {
    return 'border-sky-800 bg-sky-950/50 text-sky-100'
  }

  return 'border-neutral-700 bg-neutral-950 text-neutral-300'
}

function paymentTimingText(payment: PaymentInstance) {
  const graceUntilDate = lifecyclePaymentGraceUntilDate(payment)
  const graceDays = lifecyclePaymentGraceDays(payment)

  if (payment.isOverdue || payment.lifecycleState === 'overdue') {
    return payment.daysFromDueDate && payment.daysFromDueDate > 0
      ? `Vencido hace ${payment.daysFromDueDate} dias`
      : 'Vencido'
  }

  if (payment.isInGracePeriod && graceUntilDate) {
    return `En gracia hasta ${formatShortDate(graceUntilDate)}`
  }

  if (graceUntilDate) {
    return graceDays > 0
      ? `Gracia ${graceDays} dias hasta ${formatShortDate(graceUntilDate)}`
      : `Gracia hasta ${formatShortDate(graceUntilDate)}`
  }

  return null
}

function GraceWindowMarker({
  payment,
  date,
}: {
  payment: PaymentInstance
  date: string
}) {
  const graceUntilDate = dateKey(lifecyclePaymentGraceUntilDate(payment))
  const isLastGraceDay = graceUntilDate === date
  const dueDate = paymentDate(payment)

  return (
    <div
      className={`rounded border px-2 py-1 text-[11px] ${
        isLastGraceDay
          ? 'border-amber-500 bg-amber-950/70 text-amber-100'
          : 'border-amber-900 bg-amber-950/30 text-amber-200'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate">{payment.name || 'Pago'}</span>
        <span className="shrink-0">
          {isLastGraceDay ? 'Ultimo dia' : 'Gracia'}
        </span>
      </div>
      <p className="mt-0.5 truncate opacity-80">
        {formatShortDate(dueDate)} - {formatShortDate(graceUntilDate)}
      </p>
    </div>
  )
}

function PaymentChip({ payment }: { payment: PaymentInstance }) {
  const dueDate = paymentDate(payment)
  const timingText = paymentTimingText(payment)

  return (
    <div
      className={`rounded border px-2 py-1.5 text-xs ${statusClasses(payment)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate font-medium">
          {payment.name || 'Pago'}
        </span>
        <span className="shrink-0 font-semibold">{money(payment.amount)}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] opacity-80">
        <span>{statusLabel(payment)}</span>
        <span>{formatShortDate(dueDate)}</span>
      </div>
      {timingText && (
        <p className="mt-1 text-[11px] opacity-80">{timingText}</p>
      )}
    </div>
  )
}

function PaymentListRow({ payment }: { payment: PaymentInstance }) {
  const dueDate = paymentDate(payment)
  const graceUntilDate = lifecyclePaymentGraceUntilDate(payment)
  const timingText = paymentTimingText(payment)
  const notes = friendlyLifecyclePaymentNotes(payment)

  return (
    <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate font-medium text-neutral-100">
            {payment.name || 'Pago'}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-neutral-400">
            <span>Vence: {formatShortDate(dueDate)}</span>
            {graceUntilDate && (
              <span>Gracia: {formatShortDate(graceUntilDate)}</span>
            )}
            {timingText && <span>{timingText}</span>}
          </div>
          {notes && <p className="mt-2 text-sm text-neutral-300">{notes}</p>}
        </div>
        <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
          <span
            className={`rounded-full border px-2 py-1 text-xs ${statusClasses(
              payment
            )}`}
          >
            {statusLabel(payment)}
          </span>
          <span className="text-lg font-bold">{money(payment.amount)}</span>
        </div>
      </div>
    </div>
  )
}

export default function PaymentScheduleView({
  payments,
  today,
}: {
  payments: PaymentInstance[]
  today: string
}) {
  const sortedPayments = useMemo(() => sortPayments(payments), [payments])
  const monthKeys = useMemo(() => {
    const keys = new Set<string>()
    sortedPayments.forEach((payment) => {
      const key = paymentMonthKey(payment)
      if (key) keys.add(key)
    })

    return Array.from(keys).sort()
  }, [sortedPayments])
  const todayMonthKey = today.slice(0, 7)
  const initialMonthKey =
    monthKeys.find((key) => key >= todayMonthKey) ||
    monthKeys[0] ||
    todayMonthKey
  const [viewMode, setViewMode] = useState<ViewMode>('calendar')
  const [selectedMonthKey, setSelectedMonthKey] = useState(initialMonthKey)
  const paymentsByDate = useMemo(() => {
    const groups = new Map<string, PaymentInstance[]>()

    for (const payment of sortedPayments) {
      const dueDate = paymentDate(payment)
      if (!dueDate || !dueDate.startsWith(selectedMonthKey)) continue

      const datePayments = groups.get(dueDate) || []
      datePayments.push(payment)
      groups.set(dueDate, datePayments)
    }

    return groups
  }, [selectedMonthKey, sortedPayments])
  const graceWindowsByDate = useMemo(() => {
    const groups = new Map<string, PaymentInstance[]>()
    const days = calendarDays(selectedMonthKey).filter(
      (day): day is number => day !== null
    )

    for (const day of days) {
      const key = `${selectedMonthKey}-${String(day).padStart(2, '0')}`
      const gracePayments = sortedPayments.filter(
        (payment) =>
          paymentHasGraceWindow(payment) &&
          paymentIsInGraceWindowOnDate(payment, key)
      )

      if (gracePayments.length) groups.set(key, gracePayments)
    }

    return groups
  }, [selectedMonthKey, sortedPayments])
  const mobileCalendarDates = useMemo(() => {
    return Array.from(
      new Set([...paymentsByDate.keys(), ...graceWindowsByDate.keys()])
    ).sort()
  }, [graceWindowsByDate, paymentsByDate])
  const visibleListPayments = sortedPayments.filter((payment) =>
    paymentDate(payment)
  )

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-bold">Calendario de pagos</h2>
          <p className="text-sm text-neutral-400">
            Fuente: Payment Lifecycle del Financial Engine
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="grid grid-cols-2 rounded border border-neutral-800 bg-neutral-950 p-1 text-sm">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`rounded px-3 py-1.5 ${
                viewMode === 'calendar'
                  ? 'bg-neutral-100 text-neutral-950'
                  : 'text-neutral-400'
              }`}
            >
              Calendario
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`rounded px-3 py-1.5 ${
                viewMode === 'list'
                  ? 'bg-neutral-100 text-neutral-950'
                  : 'text-neutral-400'
              }`}
            >
              Lista
            </button>
          </div>
        </div>
      </div>

      {monthKeys.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {monthKeys.map((monthKey) => (
            <button
              type="button"
              key={monthKey}
              onClick={() => setSelectedMonthKey(monthKey)}
              className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
                selectedMonthKey === monthKey
                  ? 'border-neutral-100 bg-neutral-100 text-neutral-950'
                  : 'border-neutral-700 bg-neutral-950 text-neutral-300'
              }`}
            >
              {formatMonthLabel(monthKey)}
            </button>
          ))}
        </div>
      )}

      {sortedPayments.length === 0 ? (
        <p className="mt-4 rounded border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
          No hay pagos abiertos en el ciclo actual.
        </p>
      ) : viewMode === 'calendar' ? (
        <div className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-semibold">{formatMonthLabel(selectedMonthKey)}</p>
            <p className="text-sm text-neutral-400">
              {Array.from(paymentsByDate.values()).flat().length} pagos
            </p>
          </div>
          <div className="hidden grid-cols-7 gap-2 text-xs text-neutral-500 md:grid">
            {weekdayLabels.map((label) => (
              <div key={label} className="px-2 py-1">
                {label}
              </div>
            ))}
          </div>
          <div className="hidden grid-cols-7 gap-2 md:grid">
            {calendarDays(selectedMonthKey).map((day, index) => {
              const key = day
                ? `${selectedMonthKey}-${String(day).padStart(2, '0')}`
                : `empty-${index}`
              const dayPayments = day ? paymentsByDate.get(key) || [] : []
              const graceWindowPayments = day
                ? graceWindowsByDate.get(key) || []
                : []
              const isToday = key === today

              return (
                <div
                  key={key}
                  className={`min-h-32 rounded border p-2 ${
                    isToday
                      ? 'border-sky-600 bg-sky-950/30'
                      : 'border-neutral-800 bg-neutral-950'
                  }`}
                >
                  {day && (
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`text-sm ${
                          isToday ? 'font-bold text-sky-100' : 'text-neutral-300'
                        }`}
                      >
                        {day}
                      </span>
                      {dayPayments.length > 1 && (
                        <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300">
                          {dayPayments.length}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {dayPayments.map((payment) => (
                      <PaymentChip key={payment.id} payment={payment} />
                    ))}
                    {graceWindowPayments.map((payment) => (
                      <GraceWindowMarker
                        key={`${payment.id}:grace:${key}`}
                        payment={payment}
                        date={key}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="space-y-2 md:hidden">
            {mobileCalendarDates.map((date) => (
              <div
                key={date}
                className={`rounded border p-3 ${
                  date === today
                    ? 'border-sky-600 bg-sky-950/30'
                    : 'border-neutral-800 bg-neutral-950'
                }`}
              >
                <p className="mb-2 text-sm font-semibold">
                  {formatShortDate(date)}
                </p>
                <div className="space-y-2">
                  {(paymentsByDate.get(date) || []).map((payment) => (
                    <PaymentChip key={payment.id} payment={payment} />
                  ))}
                  {(graceWindowsByDate.get(date) || []).map((payment) => (
                    <GraceWindowMarker
                      key={`${payment.id}:mobile-grace:${date}`}
                      payment={payment}
                      date={date}
                    />
                  ))}
                </div>
              </div>
            ))}
            {mobileCalendarDates.length === 0 && (
              <p className="rounded border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
                No hay pagos para este mes.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {visibleListPayments.map((payment) => (
            <PaymentListRow key={payment.id} payment={payment} />
          ))}
        </div>
      )}
    </section>
  )
}
