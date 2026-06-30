'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

export type HistoryMovement = {
  id: string
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

type HistoryClientProps = {
  movements: HistoryMovement[]
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

export default function HistoryClient({ movements }: HistoryClientProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [bankAccount, setBankAccount] = useState('all')
  const [paymentMethod, setPaymentMethod] = useState('all')
  const [month, setMonth] = useState('all')
  const [year, setYear] = useState('all')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')

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
            Pendientes excluidos
          </h2>
          <p className="text-3xl font-bold">Sí</p>
        </div>
      </section>

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
          <div className="hidden grid-cols-6 gap-3 border-b p-3 text-sm font-semibold opacity-70 md:grid">
            <span>Fecha</span>
            <span>Comercio / persona</span>
            <span>Monto</span>
            <span>Categoría</span>
            <span>Banco / cuenta</span>
            <span>Método</span>
          </div>

          <div className="divide-y">
            {filteredMovements.map((movement) => (
              <div
                className="grid grid-cols-1 gap-2 p-3 md:grid-cols-6 md:items-center"
                key={movement.id}
              >
                <span className="text-sm opacity-80">
                  {displayDate(movement.date)}
                </span>
                <span className="font-medium">{movement.merchant}</span>
                <strong>{money(movement.amount)}</strong>
                <span>{movement.category}</span>
                <span className="text-sm">
                  {movement.institution}
                  <br />
                  <span className="opacity-70">{movement.account}</span>
                </span>
                <span>{movement.paymentMethod}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
