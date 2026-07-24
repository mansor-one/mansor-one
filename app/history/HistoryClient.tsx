'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

export type HistoryMovement = {
  id: string
  sourceTable: string
  quickEntryId: string | null
  date: string
  merchant: string
  rawMerchant: string
  amount: number
  categoryCode: string | null
  category: string
  categoryKind: string
  institution: string
  account: string
  bankAccount: string
  paymentMethod: string
  identity: string
}

type CategoryOption = {
  value: string
  label: string
  kind: string
}

type HistoryClientProps = {
  categoryOptions: CategoryOption[]
  movements: HistoryMovement[]
  resolvedDuplicateMovements: HistoryMovement[]
}

const monthNames = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  )
}

function money(value: number) {
  const absoluteValue = Math.abs(Number(value || 0))
  const sign = value < 0 ? '-' : ''

  return `${sign}$${absoluteValue.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function displayDate(dateString: string) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString('es-PR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function categoryPillClasses(kind: string) {
  if (kind === 'payment') return 'border-amber-400/30 bg-amber-400/10 text-amber-100'
  if (kind === 'transfer') return 'border-sky-400/30 bg-sky-400/10 text-sky-100'
  if (kind === 'income') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
  return 'border-violet-400/30 bg-violet-400/10 text-violet-100'
}

function monthValue(dateString: string) {
  return new Date(`${dateString}T00:00:00`).getMonth() + 1
}

function yearValue(dateString: string) {
  return new Date(`${dateString}T00:00:00`).getFullYear()
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return

  const headers = Object.keys(rows[0])
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) =>
      headers.map((header) => csvEscape(row[header])).join(',')
    ),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportRows(movements: HistoryMovement[]) {
  return movements.map((movement) => ({
    fecha: movement.date,
    comercio_o_persona: movement.merchant,
    monto: movement.amount,
    categoria: movement.category,
    institucion: movement.institution,
    cuenta: movement.account,
    metodo: movement.paymentMethod,
  }))
}

function currentPeriod() {
  const now = new Date()

  return {
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
  }
}

function previousPeriod() {
  const date = new Date()
  date.setMonth(date.getMonth() - 1)

  return {
    month: String(date.getMonth() + 1),
    year: String(date.getFullYear()),
  }
}

type SaveState = {
  id: string
  tone: 'success' | 'error'
  message: string
} | null

export default function HistoryClient({
  categoryOptions,
  movements,
  resolvedDuplicateMovements,
}: HistoryClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [bankAccount, setBankAccount] = useState('all')
  const [paymentMethod, setPaymentMethod] = useState('all')
  const [month, setMonth] = useState('all')
  const [year, setYear] = useState('all')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>(null)

  const categories = useMemo(
    () => uniqueSorted(movements.map((movement) => movement.category)),
    [movements]
  )
  const bankAccounts = useMemo(
    () => uniqueSorted(movements.map((movement) => movement.bankAccount)),
    [movements]
  )
  const paymentMethods = useMemo(
    () => uniqueSorted(movements.map((movement) => movement.paymentMethod)),
    [movements]
  )
  const years = useMemo(
    () =>
      uniqueSorted(
        movements.map((movement) => String(yearValue(movement.date)))
      ).sort((a, b) => Number(b) - Number(a)),
    [movements]
  )

  const filteredMovements = useMemo(() => {
    const normalizedSearch = normalize(search)
    const min = minAmount.trim() ? Number(minAmount) : null
    const max = maxAmount.trim() ? Number(maxAmount) : null

    return movements.filter((movement) => {
      const searchable = normalize(
        [
          movement.merchant,
          movement.rawMerchant,
          movement.category,
          movement.institution,
          movement.account,
          movement.paymentMethod,
        ].join(' ')
      )
      const absoluteAmount = Math.abs(movement.amount)

      if (normalizedSearch && !searchable.includes(normalizedSearch)) {
        return false
      }

      if (category !== 'all' && movement.category !== category) {
        return false
      }

      if (bankAccount !== 'all' && movement.bankAccount !== bankAccount) {
        return false
      }

      if (paymentMethod !== 'all' && movement.paymentMethod !== paymentMethod) {
        return false
      }

      if (month !== 'all' && monthValue(movement.date) !== Number(month)) {
        return false
      }

      if (year !== 'all' && yearValue(movement.date) !== Number(year)) {
        return false
      }

      if (min !== null && Number.isFinite(min) && absoluteAmount < min) {
        return false
      }

      if (max !== null && Number.isFinite(max) && absoluteAmount > max) {
        return false
      }

      return true
    })
  }, [
    bankAccount,
    category,
    maxAmount,
    minAmount,
    month,
    movements,
    paymentMethod,
    search,
    year,
  ])

  const totalAmount = filteredMovements.reduce(
    (sum, movement) => sum + movement.amount,
    0
  )

  function applyPeriod(period: { month: string; year: string }) {
    setMonth(period.month)
    setYear(period.year)
  }

  function clearFilters() {
    setSearch('')
    setCategory('all')
    setBankAccount('all')
    setPaymentMethod('all')
    setMonth('all')
    setYear('all')
    setMinAmount('')
    setMaxAmount('')
  }

  function startEditing(movement: HistoryMovement) {
    setEditingId(movement.id)
    setSelectedCategory(
      categoryOptions.some((option) => option.value === movement.category)
        ? movement.category
        : ''
    )
    setSaveState(null)
  }

  function cancelEditing() {
    setEditingId(null)
    setSelectedCategory('')
  }

  async function saveCategory(movement: HistoryMovement) {
    if (!movement.quickEntryId) {
      setSaveState({
        id: movement.id,
        tone: 'error',
        message: 'Solo se pueden editar movimientos confirmados.',
      })
      return
    }

    setSavingId(movement.id)
    setSaveState(null)

    try {
      const response = await fetch('/api/ledger/update-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quickEntryId: movement.quickEntryId,
          category: selectedCategory,
        }),
      })
      const data = await response.json()

      if (!response.ok || data.error) {
        setSaveState({
          id: movement.id,
          tone: 'error',
          message: data.error || 'No se pudo actualizar la categoría.',
        })
        return
      }

      setSaveState({
        id: movement.id,
        tone: 'success',
        message: 'Categoría actualizada.',
      })
      setEditingId(null)
      setSelectedCategory('')
      startTransition(() => {
        router.refresh()
      })
    } catch {
      setSaveState({
        id: movement.id,
        tone: 'error',
        message: 'No se pudo actualizar la categoría.',
      })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded border p-4">
          <h2 className="text-sm font-semibold opacity-70">Movimientos</h2>
          <p className="text-3xl font-bold">{filteredMovements.length}</p>
        </div>
        <div className="rounded border p-4">
          <h2 className="text-sm font-semibold opacity-70">
            Total visible
          </h2>
          <p className="text-3xl font-bold">{money(totalAmount)}</p>
        </div>
        <div className="rounded border p-4">
          <h2 className="text-sm font-semibold opacity-70">
            Duplicados resueltos
          </h2>
          <p className="text-3xl font-bold">
            {resolvedDuplicateMovements.length}
          </p>
        </div>
      </section>

      {resolvedDuplicateMovements.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-amber-400/35 bg-[#0b1730] text-slate-100 shadow-lg shadow-black/20" aria-labelledby="resolved-duplicates-title">
          <div className="border-l-4 border-amber-400 bg-amber-400/[0.06] p-4 sm:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-300/40 bg-amber-400/15 text-lg text-amber-200" aria-hidden="true">!</span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Advertencia de auditoría</p>
                  <h2 className="mt-1 text-lg font-bold text-white sm:text-xl" id="resolved-duplicates-title">
                    Movimientos preservados como duplicados
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
                Estos quick_entries siguen guardados para auditoría, pero no
                cuentan en los totales activos.
                  </p>
                </div>
              </div>
              <Link
                className="inline-flex w-full shrink-0 items-center justify-center rounded-lg border border-amber-300/50 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-200 hover:bg-amber-300/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 md:w-auto"
                href="/dev/confirmed-ledger-duplicates"
              >
                Revisar resoluciones
              </Link>
            </div>
          </div>
          <div className="p-3 sm:p-4">
            <div className="mb-2 hidden grid-cols-[0.9fr_1.5fr_0.7fr_1fr_1.5fr] gap-3 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400 md:grid" aria-hidden="true">
              <span>Fecha</span><span>Comercio / Persona</span><span>Monto</span><span>Categoría</span><span>Cuenta / Tarjeta</span>
            </div>
            <div className="space-y-2">
            {resolvedDuplicateMovements.slice(0, 5).map((movement) => (
              <div
                className="grid grid-cols-1 gap-3 rounded-lg border border-white/10 bg-[#081225] p-3 text-sm shadow-sm md:grid-cols-[0.9fr_1.5fr_0.7fr_1fr_1.5fr] md:items-center"
                key={movement.id}
              >
                <div><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:hidden">Fecha</span><span className="text-slate-300">{displayDate(movement.date)}</span></div>
                <div className="min-w-0"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:hidden">Comercio / Persona</span><span className="break-words font-semibold text-white">{movement.merchant}</span></div>
                <div><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:hidden">Monto</span><strong className="text-slate-100">{money(movement.amount)}</strong></div>
                <div><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:hidden">Categoría</span><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${categoryPillClasses(movement.categoryKind)}`}>{movement.category}</span></div>
                <div className="min-w-0"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:hidden">Cuenta / Tarjeta</span><span className="inline-flex max-w-full break-words rounded-md border border-sky-400/25 bg-sky-400/10 px-2.5 py-1 text-xs font-medium text-sky-100">{movement.bankAccount}</span></div>
              </div>
            ))}
            </div>
          </div>
        </section>
      )}

      <section className="rounded border p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-xl font-bold">Buscar movimientos</h2>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded border px-3 py-2 text-sm"
                onClick={() => applyPeriod(currentPeriod())}
                type="button"
              >
                Este mes
              </button>
              <button
                className="rounded border px-3 py-2 text-sm"
                onClick={() => applyPeriod(previousPeriod())}
                type="button"
              >
                Mes pasado
              </button>
              <button
                className="rounded border px-3 py-2 text-sm"
                onClick={() => setPaymentMethod('Crédito')}
                type="button"
              >
                Crédito
              </button>
              <button
                className="rounded border px-3 py-2 text-sm"
                onClick={() => setPaymentMethod('Débito')}
                type="button"
              >
                Débito
              </button>
              <span className="rounded border px-3 py-2 text-sm opacity-70">
                Pendientes excluidos
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4">
            <label className="space-y-1">
              <span className="text-sm font-medium">Comercio o persona</span>
              <input
                className="w-full rounded border bg-transparent px-3 py-2"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar"
                type="search"
                value={search}
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Categoría</span>
              <select
                className="w-full rounded border bg-transparent px-3 py-2"
                onChange={(event) => setCategory(event.target.value)}
                value={category}
              >
                <option value="all">Todas</option>
                {categories.map((categoryOption) => (
                  <option key={categoryOption} value={categoryOption}>
                    {categoryOption}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Banco / cuenta</span>
              <select
                className="w-full rounded border bg-transparent px-3 py-2"
                onChange={(event) => setBankAccount(event.target.value)}
                value={bankAccount}
              >
                <option value="all">Todas</option>
                {bankAccounts.map((bankAccountOption) => (
                  <option key={bankAccountOption} value={bankAccountOption}>
                    {bankAccountOption}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Método de pago</span>
              <select
                className="w-full rounded border bg-transparent px-3 py-2"
                onChange={(event) => setPaymentMethod(event.target.value)}
                value={paymentMethod}
              >
                <option value="all">Todos</option>
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Mes</span>
              <select
                className="w-full rounded border bg-transparent px-3 py-2"
                onChange={(event) => setMonth(event.target.value)}
                value={month}
              >
                <option value="all">Todos</option>
                {monthNames.map((monthName, index) => (
                  <option key={monthName} value={index + 1}>
                    {monthName}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Año</span>
              <select
                className="w-full rounded border bg-transparent px-3 py-2"
                onChange={(event) => setYear(event.target.value)}
                value={year}
              >
                <option value="all">Todos</option>
                {years.map((yearOption) => (
                  <option key={yearOption} value={yearOption}>
                    {yearOption}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Monto mínimo</span>
              <input
                className="w-full rounded border bg-transparent px-3 py-2"
                min="0"
                onChange={(event) => setMinAmount(event.target.value)}
                placeholder="0"
                type="number"
                value={minAmount}
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Monto máximo</span>
              <input
                className="w-full rounded border bg-transparent px-3 py-2"
                min="0"
                onChange={(event) => setMaxAmount(event.target.value)}
                placeholder="Sin límite"
                type="number"
                value={maxAmount}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded border px-4 py-2"
              onClick={() =>
                downloadCsv('historial-movimientos.csv', exportRows(filteredMovements))
              }
              type="button"
            >
              Exportar CSV
            </button>
            <button
              className="rounded border px-4 py-2"
              onClick={clearFilters}
              type="button"
            >
              Limpiar filtros
            </button>
            <Link className="rounded border px-4 py-2" href="/spending">
              Ver gastos
            </Link>
            <Link
              className="rounded border px-4 py-2"
              href="/lab/review-queue"
            >
              Revisar pendientes
            </Link>
          </div>
        </div>
      </section>

      {filteredMovements.length === 0 ? (
        <section className="rounded border p-6 text-center">
          <h2 className="text-xl font-bold">No encontramos movimientos</h2>
          <p className="mt-2 opacity-70">
            Prueba cambiar los filtros o revisar otro mes.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded border">
          <div className="hidden grid-cols-7 gap-3 border-b p-3 text-sm font-semibold opacity-70 md:grid">
            <span>Fecha</span>
            <span>Comercio / persona</span>
            <span>Monto</span>
            <span>Categoría</span>
            <span>Banco / cuenta</span>
            <span>Método</span>
            <span>Acciones</span>
          </div>

          <div className="divide-y">
            {filteredMovements.map((movement) => (
              <div
                className="grid grid-cols-1 gap-2 p-3 md:grid-cols-7 md:items-center"
                key={movement.id}
              >
                <span className="text-sm opacity-80">
                  {displayDate(movement.date)}
                </span>
                <span className="font-medium">{movement.merchant}</span>
                <strong>{money(movement.amount)}</strong>
                <div className="space-y-2">
                  <span>{movement.category}</span>
                  {editingId === movement.id && (
                    <div className="space-y-2">
                      <select
                        className="w-full rounded border bg-transparent px-3 py-2 text-sm"
                        disabled={savingId === movement.id || isPending}
                        onChange={(event) =>
                          setSelectedCategory(event.target.value)
                        }
                        value={selectedCategory}
                      >
                        <option value="">Seleccionar categoría</option>
                        {categoryOptions.map((categoryOption) => (
                          <option
                            key={categoryOption.value}
                            value={categoryOption.value}
                          >
                            {categoryOption.label}
                          </option>
                        ))}
                      </select>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded border px-3 py-2 text-sm disabled:opacity-60"
                          disabled={
                            savingId === movement.id ||
                            isPending ||
                            !selectedCategory
                          }
                          onClick={() => saveCategory(movement)}
                          type="button"
                        >
                          {savingId === movement.id ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button
                          className="rounded border px-3 py-2 text-sm"
                          disabled={savingId === movement.id || isPending}
                          onClick={cancelEditing}
                          type="button"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  {saveState?.id === movement.id && (
                    <p
                      className={`text-sm ${
                        saveState.tone === 'error'
                          ? 'text-red-600'
                          : 'text-green-600'
                      }`}
                    >
                      {saveState.message}
                    </p>
                  )}
                </div>
                <span className="text-sm">
                  {movement.institution}
                  <br />
                  <span className="opacity-70">{movement.account}</span>
                </span>
                <span>{movement.paymentMethod}</span>
                <span>
                  {movement.quickEntryId ? (
                    <button
                      className="rounded border px-3 py-2 text-sm"
                      disabled={savingId === movement.id || isPending}
                      onClick={() => startEditing(movement)}
                      type="button"
                    >
                      Editar categoría
                    </button>
                  ) : (
                    <span className="text-sm opacity-60">No editable</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
