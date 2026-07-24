'use client'

import { useState } from 'react'
import type { LegacyFinancialGoalRow } from '@/lib/financial-engine'
import { updateGoalAction } from './actions'

function monthsUntil(dateString: string) {
  const today = new Date()
  const target = new Date(dateString)

  return Math.max(
    1,
    Math.ceil(
      (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30)
    )
  )
}

function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString()}`
}

export default function GoalCard({ goal }: { goal: LegacyFinancialGoalRow }) {
  const [editing, setEditing] = useState(false)

  const target = Number(goal.target_amount || 0)
  const current = Number(goal.current_amount || 0)
  const remaining = Math.max(0, target - current)
  const months = goal.target_date ? monthsUntil(goal.target_date) : 1
  const monthlyRequired = target > 0 ? remaining / months : 0

  if (editing) {
    return (
      <form action={updateGoalAction} className="space-y-3 rounded border p-4">
        <input name="goalId" type="hidden" value={goal.id} />
        <h2 className="text-2xl font-bold">Editando meta</h2>

        <GoalFields goal={goal} />

        <div className="flex gap-2">
          <button className="rounded border p-2" type="submit">
            Guardar cambios
          </button>

          <button
            className="rounded border p-2"
            onClick={() => setEditing(false)}
            type="button"
          >
            Cancelar
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="space-y-2 rounded border p-4">
      <h2 className="text-2xl font-bold">{goal.name}</h2>

      <p>Tipo: {goal.goal_type}</p>
      <p>Fecha objetivo: {goal.target_date || 'N/A'}</p>
      <p>Prioridad: {goal.priority || 'N/A'}</p>

      <p>Meta: {target > 0 ? formatMoney(target) : 'Pendiente definir'}</p>
      <p>Ahorrado: {formatMoney(current)}</p>
      <p>Faltan: {target > 0 ? formatMoney(remaining) : 'Pendiente definir'}</p>

      {target > 0 ? (
        <p className="font-semibold">
          Necesitas ahorrar aprox. {formatMoney(monthlyRequired)} / mes
        </p>
      ) : (
        <p className="font-semibold">
          Define el costo total para calcular el ahorro mensual.
        </p>
      )}

      {goal.notes && <p className="text-sm opacity-70">{goal.notes}</p>}

      <button
        className="mt-2 rounded border p-2"
        onClick={() => setEditing(true)}
        type="button"
      >
        Editar
      </button>
    </div>
  )
}

export function GoalFields({ goal }: { goal?: Partial<LegacyFinancialGoalRow> }) {
  return (
    <>
      <label className="block space-y-1">
        <span>Nombre</span>
        <input
          className="w-full rounded border p-2"
          defaultValue={goal?.name || ''}
          name="name"
          placeholder="Ej. Crucero familiar"
          required
        />
      </label>

      <label className="block space-y-1">
        <span>Tipo</span>
        <select
          className="w-full rounded border p-2"
          defaultValue={goal?.goal_type || 'Custom'}
          name="goalType"
        >
          <option value="Vehicle">Vehicle</option>
          <option value="Travel">Travel</option>
          <option value="Emergency Fund">Emergency Fund</option>
          <option value="Debt Payoff">Debt Payoff</option>
          <option value="Custom">Custom</option>
        </select>
      </label>

      <label className="block space-y-1">
        <span>Costo total estimado</span>
        <input
          className="w-full rounded border p-2"
          defaultValue={goal?.target_amount ? String(goal.target_amount) : ''}
          name="targetAmount"
          placeholder="Opcional"
          type="number"
        />
      </label>

      <label className="block space-y-1">
        <span>Ahorrado actual</span>
        <input
          className="w-full rounded border p-2"
          defaultValue={goal?.current_amount ? String(goal.current_amount) : ''}
          name="currentAmount"
          placeholder="Opcional"
          type="number"
        />
      </label>

      <label className="block space-y-1">
        <span>Fecha objetivo</span>
        <input
          className="w-full rounded border p-2"
          defaultValue={goal?.target_date || ''}
          name="targetDate"
          type="date"
        />
      </label>

      <label className="block space-y-1">
        <span>Prioridad</span>
        <input
          className="w-full rounded border p-2"
          defaultValue={goal?.priority ? String(goal.priority) : '3'}
          name="priority"
          placeholder="1 = alta, 3 = normal"
          type="number"
        />
      </label>

      <label className="block space-y-1">
        <span>Notas</span>
        <textarea
          className="w-full rounded border p-2"
          defaultValue={goal?.notes || ''}
          name="notes"
          placeholder="Ej. $800 dólares separarlo, falta cotización final"
        />
      </label>
    </>
  )
}
