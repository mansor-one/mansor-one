'use client'

import type { CardProfile, CardsSummary } from '@/lib/financial-engine'
import { useRouter } from 'next/navigation'
import { FormEvent, useMemo, useState, useTransition } from 'react'

type CardsClientProps = {
  summary: CardsSummary
}

type FilterKey = 'all' | 'attention' | 'active' | 'connected' | 'archived'

type ActionState = {
  cardId: string
  mode: 'edit' | 'schedule' | 'manual'
} | null

const filterLabels: Record<FilterKey, string> = {
  all: 'Todas',
  attention: 'Atención',
  active: 'Activas',
  connected: 'Conectadas',
  archived: 'Archivadas',
}

function money(value: number | null | undefined) {
  return `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function percent(value: number | null | undefined) {
  if (value === null || value === undefined) return 'Sin dato'

  return `${value}%`
}

function fallback(value: string | null | undefined, empty = 'Sin dato') {
  return value && value.trim() ? value : empty
}

function sourceLabel(card: CardProfile) {
  if (card.source === 'merged') return 'Manual + Plaid'
  if (card.source === 'plaid') return 'Plaid'

  return 'Manual'
}

function statusLabel(status: string | null) {
  if (!status) return 'Sin estado'
  if (status === 'paid') return 'Pagado'
  if (status === 'initiated') return 'Iniciado'
  if (status === 'pending') return 'Pendiente'
  if (status === 'overdue') return 'Vencido'
  if (status === 'dueSoon') return 'Vence pronto'
  if (status === 'upcoming') return 'Próximo pago'

  return status
}

function statusClasses(status: string | null) {
  if (status === 'paid') return 'border-emerald-700 bg-emerald-950/40'
  if (status === 'initiated') return 'border-amber-700 bg-amber-950/40'
  if (status === 'overdue') return 'border-red-700 bg-red-950/40'
  if (status === 'dueSoon') return 'border-amber-700 bg-amber-950/40'
  if (status === 'upcoming') return 'border-sky-700 bg-sky-950/40'

  return 'border-neutral-700 bg-neutral-900'
}

function warningLabel(warning: string) {
  const labels: Record<string, string> = {
    'No payment schedule': 'Sin calendario',
    'Not connected to Plaid': 'No conectada a Plaid',
    'Duplicate manual profile': 'Perfil manual duplicado',
    'Missing credit limit': 'Falta límite',
    'Missing due date': 'Falta fecha de pago',
    'Missing owner': 'Falta dueño',
    'Inactive manual record with active Plaid match':
      'Perfil manual inactivo vinculado a cuenta activa',
    'Promo ends within 60 days': 'Promo termina pronto',
  }

  return labels[warning] || warning
}

function checklistLabel(item: string) {
  const labels: Record<string, string> = {
    owner: 'Dueño',
    APR: 'APR regular',
    'promo APR': 'APR promo',
    'promo end date': 'Fecha fin de promo',
    'due day': 'Día de pago',
    'minimum payment': 'Pago mínimo',
    autopay: 'Autopay',
    schedule: 'Calendario',
  }

  return labels[item] || item
}

function promoEndLabel(card: CardProfile) {
  if (!card.promoEndDate) return 'Sin fecha'
  if (card.daysUntilPromoEnd === null) return card.promoEndDate
  if (card.daysUntilPromoEnd < 0) {
    return `${card.promoEndDate} · venció hace ${Math.abs(
      card.daysUntilPromoEnd
    )} días`
  }

  return `${card.promoEndDate} · faltan ${card.daysUntilPromoEnd} días`
}

function numberFieldValue(value: number | null | undefined) {
  return value === null || value === undefined ? '' : String(value)
}

function manualProfileName(card: CardProfile) {
  if (card.displayName && card.institution) {
    return `${card.institution} ${card.displayName}`.trim()
  }

  return card.displayName
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-neutral-800 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  )
}

function SummaryTile({
  label,
  value,
  detail,
}: {
  label: string
  value: string | number
  detail: string
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-sm text-neutral-400">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{detail}</p>
    </div>
  )
}

export default function CardsClient({ summary }: CardsClientProps) {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [action, setAction] = useState<ActionState>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const visibleCards = useMemo(() => {
    if (filter === 'attention') return summary.attentionNeeded
    if (filter === 'active') return summary.activeCards
    if (filter === 'connected') return summary.connectedCards
    if (filter === 'archived') return summary.archivedCards

    return summary.cards
  }, [filter, summary])

  function refresh(messageText: string) {
    setMessage(messageText)
    setAction(null)
    startTransition(() => router.refresh())
  }

  async function submitJson(url: string, payload: Record<string, unknown>) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'No se pudo guardar el cambio.')
    }

    return result
  }

  function actionButtonForWarning(card: CardProfile, warning: string) {
    if (warning === 'No payment schedule') {
      return (
        <button
          className="rounded border border-amber-700 bg-amber-950/40 px-2 py-1 text-xs text-amber-100"
          onClick={() => setAction({ cardId: card.id, mode: 'schedule' })}
          type="button"
        >
          Crear calendario
        </button>
      )
    }

    if (
      warning === 'Missing owner' ||
      warning === 'Missing due date' ||
      warning === 'Missing credit limit'
    ) {
      return (
        <button
          className="rounded border border-amber-700 bg-amber-950/40 px-2 py-1 text-xs text-amber-100"
          onClick={() => setAction({ cardId: card.id, mode: 'edit' })}
          type="button"
        >
          {warning === 'Missing owner' ? 'Editar dueño' : warningLabel(warning)}
        </button>
      )
    }

    if (warning === 'Not connected to Plaid') {
      return (
        <button
          className="rounded border border-neutral-700 px-2 py-1 text-xs"
          onClick={() => setAction({ cardId: card.id, mode: 'edit' })}
          type="button"
        >
          Marcar manual / conectar luego
        </button>
      )
    }

    return (
      <span
        className="rounded border border-amber-700 bg-amber-950/40 px-2 py-1 text-xs text-amber-100"
        key={warning}
      >
        {warningLabel(warning)}
      </span>
    )
  }

  async function handleEditSubmit(
    event: FormEvent<HTMLFormElement>,
    card: CardProfile
  ) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    try {
      await submitJson('/api/cards/update-profile', {
        cardId: card.manualCreditCardId,
        name: formData.get('name'),
        ownerId: formData.get('ownerId'),
        isActive: formData.get('isActive') === 'on',
        creditLimit: formData.get('creditLimit'),
        minimumPayment: formData.get('minimumPayment'),
        dueDay: formData.get('dueDay'),
        cutoffDay: formData.get('cutoffDay'),
        regularApr: formData.get('regularApr'),
        promoApr: formData.get('promoApr'),
        autopayEnabled: formData.get('autopayEnabled') === 'on',
        autopayAccountLabel: formData.get('autopayAccountLabel'),
        paymentAccountNotes: formData.get('paymentAccountNotes'),
        manualLast4: formData.get('manualLast4'),
        interestNotes: formData.get('interestNotes'),
        promoEndDate: formData.get('promoEndDate'),
        useCase: formData.get('useCase'),
        cardType: formData.get('cardType'),
      })
      refresh('Tarjeta actualizada.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar.')
    }
  }

  async function handleManualProfileSubmit(
    event: FormEvent<HTMLFormElement>,
    card: CardProfile
  ) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    try {
      await submitJson('/api/cards/create-manual-profile', {
        plaidAccountId: card.plaidAccountId,
        name: formData.get('name'),
        bank: formData.get('bank'),
        ownerId: formData.get('ownerId'),
        creditLimit: formData.get('creditLimit'),
        minimumPayment: formData.get('minimumPayment'),
        dueDay: formData.get('dueDay'),
        cutoffDay: formData.get('cutoffDay'),
        regularApr: formData.get('regularApr'),
        promoApr: formData.get('promoApr'),
        autopayEnabled: formData.get('autopayEnabled') === 'on',
        autopayAccountLabel: formData.get('autopayAccountLabel'),
        paymentAccountNotes: formData.get('paymentAccountNotes'),
        manualLast4: formData.get('manualLast4'),
        promoEndDate: formData.get('promoEndDate'),
        interestNotes: formData.get('interestNotes'),
        cardType: formData.get('cardType'),
        useCase: formData.get('useCase'),
      })
      refresh('Perfil manual creado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear.')
    }
  }

  async function handleScheduleSubmit(
    event: FormEvent<HTMLFormElement>,
    card: CardProfile
  ) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    try {
      await submitJson('/api/cards/create-schedule', {
        cardId: card.manualCreditCardId,
        name: formData.get('name'),
        amount: formData.get('amount'),
        dueDay: formData.get('dueDay'),
        paymentAccount: formData.get('paymentAccount'),
        recurringMonthly: formData.get('recurringMonthly') === 'on',
      })
      refresh('Calendario creado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear.')
    }
  }

  async function handleConfirmPayment(card: CardProfile) {
    if (!card.currentPaymentInstanceId) return

    try {
      await submitJson('/api/cards/confirm-payment', {
        cardProfileId: card.id,
        paymentInstanceId: card.currentPaymentInstanceId,
      })
      refresh('Pago marcado como confirmado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo confirmar.')
    }
  }

  return (
    <div className="space-y-8">
      {message && (
        <div className="rounded border border-sky-700 bg-sky-950/40 p-3 text-sm">
          {message}
        </div>
      )}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SummaryTile
          detail={`${summary.cards.length} tarjetas lógicas`}
          label="Deuda total"
          value={money(summary.totalBalance)}
        />
        <SummaryTile
          detail="Plaid o límite manual"
          label="Crédito disponible"
          value={money(summary.totalAvailableCredit)}
        />
        <SummaryTile
          detail="Calendarios y perfiles manuales"
          label="Pagos mínimos"
          value={money(summary.totalMinimumPayment)}
        />
        <SummaryTile
          detail={`${summary.warnings.length} tipos de advertencia`}
          label="Necesitan atención"
          value={summary.attentionNeeded.length}
        />
      </section>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-4">
          <h2 className="text-xl font-bold">Resumen de validación</h2>
          <p className="text-sm text-neutral-400">
            Una tarjeta lógica por fila. Usa los filtros para enfocarte sin
            repetir tarjetas completas.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr className="border-b border-neutral-800">
                <th className="py-2 pr-4">Tarjeta</th>
                <th className="py-2 pr-4">Fuente</th>
                <th className="py-2 pr-4">Calendario</th>
                <th className="py-2 pr-4">Plaid</th>
                <th className="py-2 pr-4">Dueño</th>
                <th className="py-2 pr-4">Estado</th>
                <th className="py-2 pr-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {summary.cards.map((card) => (
                <tr className="border-b border-neutral-800" key={card.id}>
                  <td className="py-3 pr-4 font-medium">{card.displayName}</td>
                  <td className="py-3 pr-4">{sourceLabel(card)}</td>
                  <td className="py-3 pr-4">
                    {card.scheduledPaymentId ? 'Programado' : 'Sin calendario'}
                  </td>
                  <td className="py-3 pr-4">
                    {card.isConnected ? 'Conectada' : 'No conectada'}
                  </td>
                  <td className="py-3 pr-4">
                    {fallback(card.owner, 'Dueño no identificado')}
                  </td>
                  <td className="py-3 pr-4">{statusLabel(card.paymentStatus)}</td>
                  <td className="py-3 pr-4">
                    <button
                      className="rounded border border-neutral-700 px-2 py-1 text-xs"
                      onClick={() => setAction({ cardId: card.id, mode: 'edit' })}
                      type="button"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(filterLabels) as FilterKey[]).map((key) => (
          <button
            className={`rounded border px-3 py-2 text-sm ${
              filter === key
                ? 'border-sky-600 bg-sky-950/50 text-sky-100'
                : 'border-neutral-700 text-neutral-300'
            }`}
            key={key}
            onClick={() => setFilter(key)}
            type="button"
          >
            {filterLabels[key]}
          </button>
        ))}
      </div>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {visibleCards.map((card) => (
          <article
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"
            key={card.id}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500">
                  {fallback(card.institution, 'Institución no identificada')}
                </p>
                <h3 className="mt-1 text-xl font-bold">{card.displayName}</h3>
                <p className="mt-1 text-sm text-neutral-400">
                  {sourceLabel(card)} ·{' '}
                  {fallback(card.owner, 'Dueño no identificado')}
                </p>
              </div>

              <div
                className={`w-fit rounded border px-3 py-1 text-sm ${statusClasses(
                  card.paymentStatus
                )}`}
              >
                {statusLabel(card.paymentStatus)}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
              <Metric label="Balance" value={money(card.currentBalance)} />
              <Metric label="Disponible" value={money(card.availableCredit)} />
              <Metric label="Límite" value={money(card.creditLimit)} />
              <Metric label="Uso" value={percent(card.utilizationPercent)} />
              <Metric label="Pago mínimo" value={money(card.minimumPayment)} />
              <Metric label="Próximo pago" value={fallback(card.nextDueDate)} />
              <Metric label="Día de pago" value={card.dueDay || 'Sin dato'} />
              <Metric label="Último pago" value={fallback(card.lastPaymentDate)} />
            </div>

            <section className="mt-4 rounded border border-neutral-800 bg-neutral-950 p-3 text-sm">
              <h4 className="font-semibold text-neutral-200">
                Interés y promos
              </h4>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                <Metric
                  label="APR regular"
                  value={
                    card.regularApr !== null
                      ? `${card.regularApr}%`
                      : fallback(card.regularAprNote, 'No guardado')
                  }
                />
                <Metric
                  label="APR promo"
                  value={
                    card.promoApr !== null
                      ? `${card.promoApr}%`
                      : fallback(card.promoAprNote, 'No guardado')
                  }
                />
                <Metric label="Promo termina" value={promoEndLabel(card)} />
              </div>
            </section>

            <section className="mt-4 rounded border border-neutral-800 bg-neutral-950 p-3 text-sm">
              <h4 className="font-semibold text-neutral-200">
                Diagnóstico de calendario
              </h4>
              <ul className="mt-2 space-y-1 text-neutral-400">
                {card.scheduleLinkDiagnostics.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="mt-4 rounded border border-neutral-800 bg-neutral-950 p-3 text-sm">
              <h4 className="font-semibold text-neutral-200">
                Datos pendientes
              </h4>
              {card.missingDataChecklist.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {card.missingDataChecklist.map((item) => (
                    <span
                      className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300"
                      key={item}
                    >
                      {checklistLabel(item)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-neutral-400">Datos mínimos completos.</p>
              )}
            </section>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="rounded border border-neutral-700 px-3 py-2 text-sm"
                onClick={() => setAction({ cardId: card.id, mode: 'edit' })}
                type="button"
              >
                Editar tarjeta
              </button>
              {!card.manualCreditCardId && card.plaidAccountId && (
                <button
                  className="rounded border border-sky-700 bg-sky-950/40 px-3 py-2 text-sm"
                  onClick={() => setAction({ cardId: card.id, mode: 'manual' })}
                  type="button"
                >
                  Crear perfil manual para esta tarjeta
                </button>
              )}
              {card.manualCreditCardId && !card.scheduledPaymentId && (
                <button
                  className="rounded border border-sky-700 bg-sky-950/40 px-3 py-2 text-sm"
                  onClick={() => setAction({ cardId: card.id, mode: 'schedule' })}
                  type="button"
                >
                  Crear calendario de pago
                </button>
              )}
              {card.currentPaymentInstanceId &&
                (card.paymentStatus === 'overdue' ||
                  card.paymentStatus === 'initiated') && (
                  <button
                    className="rounded border border-emerald-700 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100"
                    disabled={isPending}
                    onClick={() => handleConfirmPayment(card)}
                    type="button"
                  >
                    Marcar pago como confirmado
                  </button>
                )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {card.warnings.length > 0 ? (
                card.warnings.map((warning) => (
                  <span key={warning}>{actionButtonForWarning(card, warning)}</span>
                ))
              ) : (
                <span className="rounded border border-emerald-700 bg-emerald-950/40 px-2 py-1 text-xs text-emerald-100">
                  Lista para monitorear
                </span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 border-t border-neutral-800 pt-3 text-xs text-neutral-500 md:grid-cols-3">
              <p>Manual: {card.manualCreditCardId ? 'Vinculada' : 'No aplica'}</p>
              <p>Plaid: {card.plaidAccountId ? 'Vinculada' : 'No conectada'}</p>
              <p>
                Pago: {card.scheduledPaymentId ? 'Programado' : 'Sin calendario'}
              </p>
            </div>

            {action?.cardId === card.id && action.mode === 'edit' && (
              card.manualCreditCardId ? (
                <EditCardForm
                  card={card}
                  disabled={isPending}
                  onCancel={() => setAction(null)}
                  onSubmit={handleEditSubmit}
                  ownerOptions={summary.ownerOptions}
                />
              ) : (
                <div className="mt-4 rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-100">
                  Esta tarjeta viene solo de Plaid. Crea un perfil manual para
                  editar due date, APR, dueño y calendario sin tocar el balance
                  sincronizado.
                </div>
              )
            )}

            {action?.cardId === card.id && action.mode === 'manual' && (
              <ManualProfileForm
                card={card}
                disabled={isPending}
                onCancel={() => setAction(null)}
                onSubmit={handleManualProfileSubmit}
                ownerOptions={summary.ownerOptions}
              />
            )}

            {action?.cardId === card.id && action.mode === 'schedule' && (
              card.manualCreditCardId ? (
                <ScheduleForm
                  card={card}
                  disabled={isPending}
                  onCancel={() => setAction(null)}
                  onSubmit={handleScheduleSubmit}
                />
              ) : (
                <div className="mt-4 rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-100">
                  Primero crea el perfil manual para enlazar este calendario a
                  una tarjeta mantenible.
                </div>
              )
            )}
          </article>
        ))}
      </section>

      {visibleCards.length === 0 && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-neutral-300">
          No hay tarjetas en este filtro.
        </div>
      )}
    </div>
  )
}

function OwnerSelect({
  defaultValue,
  ownerOptions,
}: {
  defaultValue: string | null
  ownerOptions: CardsSummary['ownerOptions']
}) {
  return (
    <select
      className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
      defaultValue={defaultValue || ''}
      name="ownerId"
    >
      <option value="">Dueño no identificado</option>
      {ownerOptions.map((owner) => (
        <option key={owner.id} value={owner.id}>
          {owner.name}
        </option>
      ))}
    </select>
  )
}

function FormActions({
  disabled,
  onCancel,
}: {
  disabled: boolean
  onCancel: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="rounded border border-sky-700 bg-sky-950/40 px-4 py-2"
        disabled={disabled}
        type="submit"
      >
        Guardar
      </button>
      <button
        className="rounded border border-neutral-700 px-4 py-2"
        onClick={onCancel}
        type="button"
      >
        Cancelar
      </button>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-medium text-neutral-300">{label}</span>
      {children}
    </label>
  )
}

function TextInput({
  defaultValue,
  name,
  type = 'text',
}: {
  defaultValue?: string | number | null
  name: string
  type?: string
}) {
  return (
    <input
      className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
      defaultValue={defaultValue ?? ''}
      name={name}
      type={type}
    />
  )
}

function EditCardForm({
  card,
  disabled,
  ownerOptions,
  onCancel,
  onSubmit,
}: {
  card: CardProfile
  disabled: boolean
  ownerOptions: CardsSummary['ownerOptions']
  onCancel: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>, card: CardProfile) => void
}) {
  return (
    <form
      className="mt-4 space-y-4 rounded border border-neutral-700 bg-neutral-950 p-4"
      onSubmit={(event) => onSubmit(event, card)}
    >
      <h4 className="text-lg font-bold">Editar tarjeta</h4>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Nombre">
          <TextInput defaultValue={card.displayName} name="name" />
        </Field>
        <Field label="Dueño">
          <OwnerSelect defaultValue={card.ownerId} ownerOptions={ownerOptions} />
        </Field>
        <Field label="Tipo">
          <TextInput defaultValue={card.cardType} name="cardType" />
        </Field>
        <Field label="Límite">
          <TextInput
            defaultValue={numberFieldValue(card.creditLimit)}
            name="creditLimit"
            type="number"
          />
        </Field>
        <Field label="Pago mínimo">
          <TextInput
            defaultValue={numberFieldValue(card.minimumPayment)}
            name="minimumPayment"
            type="number"
          />
        </Field>
        <Field label="Día de pago">
          <TextInput
            defaultValue={numberFieldValue(card.dueDay)}
            name="dueDay"
            type="number"
          />
        </Field>
        <Field label="Día de corte">
          <TextInput
            defaultValue={numberFieldValue(card.cutoffDay)}
            name="cutoffDay"
            type="number"
          />
        </Field>
        <Field label="APR regular">
          <TextInput
            defaultValue={numberFieldValue(card.regularApr)}
            name="regularApr"
            type="number"
          />
        </Field>
        <Field label="APR promo">
          <TextInput
            defaultValue={numberFieldValue(card.promoApr)}
            name="promoApr"
            type="number"
          />
        </Field>
        <Field label="Promo termina">
          <TextInput defaultValue={card.promoEndDate} name="promoEndDate" type="date" />
        </Field>
        <Field label="Últimos 4 manual">
          <TextInput defaultValue={card.manualLast4} name="manualLast4" />
        </Field>
        <Field label="Cuenta autopay">
          <TextInput
            defaultValue={card.autopayAccountLabel}
            name="autopayAccountLabel"
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input defaultChecked={card.isActive} name="isActive" type="checkbox" />
        Activa
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          defaultChecked={card.autopayEnabled === true}
          name="autopayEnabled"
          type="checkbox"
        />
        Autopay activo
      </label>

      <Field label="Notas de interés">
        <textarea
          className="min-h-24 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
          defaultValue={card.interestNotes || ''}
          name="interestNotes"
        />
      </Field>
      <Field label="Uso recomendado">
        <textarea
          className="min-h-20 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
          defaultValue={card.useCase || ''}
          name="useCase"
        />
      </Field>
      <Field label="Notas de cuenta de pago">
        <textarea
          className="min-h-20 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
          defaultValue={card.paymentAccountNotes || ''}
          name="paymentAccountNotes"
        />
      </Field>

      <FormActions disabled={disabled} onCancel={onCancel} />
    </form>
  )
}

function ManualProfileForm({
  card,
  disabled,
  ownerOptions,
  onCancel,
  onSubmit,
}: {
  card: CardProfile
  disabled: boolean
  ownerOptions: CardsSummary['ownerOptions']
  onCancel: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>, card: CardProfile) => void
}) {
  return (
    <form
      className="mt-4 space-y-4 rounded border border-neutral-700 bg-neutral-950 p-4"
      onSubmit={(event) => onSubmit(event, card)}
    >
      <h4 className="text-lg font-bold">Crear perfil manual</h4>
      <p className="text-sm text-neutral-400">
        Esto no cambia el balance de Plaid. Solo agrega datos manuales para
        fechas, APR, dueño y calendario.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Nombre">
          <TextInput defaultValue={manualProfileName(card)} name="name" />
        </Field>
        <Field label="Institución">
          <TextInput defaultValue={card.institution} name="bank" />
        </Field>
        <Field label="Dueño">
          <OwnerSelect defaultValue={card.ownerId} ownerOptions={ownerOptions} />
        </Field>
        <Field label="Límite">
          <TextInput
            defaultValue={numberFieldValue(card.creditLimit)}
            name="creditLimit"
            type="number"
          />
        </Field>
        <Field label="Pago mínimo">
          <TextInput name="minimumPayment" type="number" />
        </Field>
        <Field label="Día de pago">
          <TextInput name="dueDay" type="number" />
        </Field>
        <Field label="Día de corte">
          <TextInput name="cutoffDay" type="number" />
        </Field>
        <Field label="APR regular">
          <TextInput name="regularApr" type="number" />
        </Field>
        <Field label="APR promo">
          <TextInput name="promoApr" type="number" />
        </Field>
        <Field label="Promo termina">
          <TextInput name="promoEndDate" type="date" />
        </Field>
        <Field label="Últimos 4 manual">
          <TextInput name="manualLast4" />
        </Field>
        <Field label="Cuenta autopay">
          <TextInput name="autopayAccountLabel" />
        </Field>
        <Field label="Tipo">
          <TextInput defaultValue="debt" name="cardType" />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input name="autopayEnabled" type="checkbox" />
        Autopay activo
      </label>

      <Field label="Notas de interés">
        <textarea
          className="min-h-24 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
          name="interestNotes"
        />
      </Field>
      <Field label="Notas de cuenta de pago">
        <textarea
          className="min-h-20 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
          name="paymentAccountNotes"
        />
      </Field>
      <Field label="Uso recomendado">
        <textarea
          className="min-h-20 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
          name="useCase"
        />
      </Field>

      <FormActions disabled={disabled} onCancel={onCancel} />
    </form>
  )
}

function ScheduleForm({
  card,
  disabled,
  onCancel,
  onSubmit,
}: {
  card: CardProfile
  disabled: boolean
  onCancel: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>, card: CardProfile) => void
}) {
  return (
    <form
      className="mt-4 space-y-4 rounded border border-neutral-700 bg-neutral-950 p-4"
      onSubmit={(event) => onSubmit(event, card)}
    >
      <h4 className="text-lg font-bold">Crear calendario de pago</h4>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Nombre del pago">
          <TextInput defaultValue={card.displayName} name="name" />
        </Field>
        <Field label="Pago mínimo">
          <TextInput
            defaultValue={numberFieldValue(card.minimumPayment)}
            name="amount"
            type="number"
          />
        </Field>
        <Field label="Día de pago">
          <TextInput
            defaultValue={numberFieldValue(card.dueDay)}
            name="dueDay"
            type="number"
          />
        </Field>
        <Field label="Cuenta de pago">
          <TextInput
            defaultValue={card.autopayAccountLabel || 'Banco Popular Debito'}
            name="paymentAccount"
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input defaultChecked name="recurringMonthly" type="checkbox" />
        Recurrente mensual
      </label>

      <FormActions disabled={disabled} onCancel={onCancel} />
    </form>
  )
}
