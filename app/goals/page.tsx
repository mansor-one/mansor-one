'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

function monthsUntil(dateString: string) {
  const today = new Date()
  const target = new Date(dateString)

  return Math.max(
    1,
    Math.ceil(
      (target.getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24 * 30)
    )
  )
}

function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString()}`
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<any[]>([])
  const [message, setMessage] = useState('')

  const [name, setName] = useState('')
  const [goalType, setGoalType] = useState('Custom')
  const [targetAmount, setTargetAmount] = useState('')
  const [currentAmount, setCurrentAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [priority, setPriority] = useState('3')
  const [notes, setNotes] = useState('')

  async function loadGoals() {
    const { data, error } = await supabase
      .from('financial_goals')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: true })

    if (error) {
      setMessage(error.message)
      return
    }

    setGoals(data || [])
  }

  async function createGoal() {
    if (!name.trim()) {
      setMessage('El nombre de la meta es requerido')
      return
    }

    const { error } = await supabase.from('financial_goals').insert({
      name,
      goal_type: goalType,
      target_amount: Number(targetAmount || 0),
      current_amount: Number(currentAmount || 0),
      target_date: targetDate || null,
      priority: Number(priority || 3),
      notes,
      is_active: true,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Meta creada ✅')
    setName('')
    setGoalType('Custom')
    setTargetAmount('')
    setCurrentAmount('')
    setTargetDate('')
    setPriority('3')
    setNotes('')
    loadGoals()
  }

  async function updateGoal(
    id: string,
    values: {
      name: string
      goal_type: string
      target_amount: number
      current_amount: number
      target_date: string | null
      priority: number
      notes: string
    }
  ) {
    const { error } = await supabase
      .from('financial_goals')
      .update(values)
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Meta actualizada ✅')
    loadGoals()
  }

  useEffect(() => {
    loadGoals()
  }, [])

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">🎯 Goals</h1>

      <Nav />

      {message && <div className="border rounded p-3">{message}</div>}

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-2xl font-bold">➕ Nueva Meta</h2>

        <label className="block space-y-1">
          <span>Nombre</span>
          <input
            className="border rounded p-2 w-full"
            placeholder="Ej. Crucero familiar"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span>Tipo</span>
          <select
            className="border rounded p-2 w-full"
            value={goalType}
            onChange={(e) => setGoalType(e.target.value)}
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
            className="border rounded p-2 w-full"
            type="number"
            placeholder="Opcional"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span>Ahorrado actual</span>
          <input
            className="border rounded p-2 w-full"
            type="number"
            placeholder="Opcional"
            value={currentAmount}
            onChange={(e) => setCurrentAmount(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span>Fecha objetivo</span>
          <input
            className="border rounded p-2 w-full"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span>Prioridad</span>
          <input
            className="border rounded p-2 w-full"
            type="number"
            placeholder="1 = alta, 3 = normal"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span>Notas</span>
          <textarea
            className="border rounded p-2 w-full"
            placeholder="Ej. $800 dólares separarlo, falta cotización final"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <button className="border rounded p-3" onClick={createGoal}>
          Guardar Meta
        </button>
      </section>

      <section className="space-y-4">
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onSave={updateGoal}
          />
        ))}
      </section>
    </main>
  )
}

function GoalCard({
  goal,
  onSave,
}: {
  goal: any
  onSave: (
    id: string,
    values: {
      name: string
      goal_type: string
      target_amount: number
      current_amount: number
      target_date: string | null
      priority: number
      notes: string
    }
  ) => void
}) {
  const [editing, setEditing] = useState(false)

  const [name, setName] = useState(goal.name || '')
  const [goalType, setGoalType] = useState(goal.goal_type || 'Custom')
  const [targetAmount, setTargetAmount] = useState(
    goal.target_amount ? String(goal.target_amount) : ''
  )
  const [currentAmount, setCurrentAmount] = useState(
    goal.current_amount ? String(goal.current_amount) : ''
  )
  const [targetDate, setTargetDate] = useState(goal.target_date || '')
  const [priority, setPriority] = useState(
    goal.priority ? String(goal.priority) : '3'
  )
  const [notes, setNotes] = useState(goal.notes || '')

  const target = Number(goal.target_amount || 0)
  const current = Number(goal.current_amount || 0)
  const remaining = Math.max(0, target - current)
  const months = goal.target_date ? monthsUntil(goal.target_date) : 1
  const monthlyRequired = target > 0 ? remaining / months : 0

  function saveChanges() {
    onSave(goal.id, {
      name,
      goal_type: goalType,
      target_amount: Number(targetAmount || 0),
      current_amount: Number(currentAmount || 0),
      target_date: targetDate || null,
      priority: Number(priority || 3),
      notes,
    })

    setEditing(false)
  }

  if (editing) {
    return (
      <div className="border rounded p-4 space-y-3">
        <h2 className="text-2xl font-bold">Editando meta</h2>

        <label className="block space-y-1">
          <span>Nombre</span>
          <input
            className="border rounded p-2 w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span>Tipo</span>
          <select
            className="border rounded p-2 w-full"
            value={goalType}
            onChange={(e) => setGoalType(e.target.value)}
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
            className="border rounded p-2 w-full"
            type="number"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span>Ahorrado actual</span>
          <input
            className="border rounded p-2 w-full"
            type="number"
            value={currentAmount}
            onChange={(e) => setCurrentAmount(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span>Fecha objetivo</span>
          <input
            className="border rounded p-2 w-full"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span>Prioridad</span>
          <input
            className="border rounded p-2 w-full"
            type="number"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span>Notas</span>
          <textarea
            className="border rounded p-2 w-full"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="flex gap-2">
          <button className="border rounded p-2" onClick={saveChanges}>
            Guardar cambios
          </button>

          <button
            className="border rounded p-2"
            onClick={() => setEditing(false)}
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border rounded p-4 space-y-2">
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

      {goal.notes && (
        <p className="text-sm opacity-70">{goal.notes}</p>
      )}

      <button
        className="border rounded p-2 mt-2"
        onClick={() => setEditing(true)}
      >
        Editar
      </button>
    </div>
  )
}