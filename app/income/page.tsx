'use client'

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default function IncomePage() {
  const [income, setIncome] = useState<any[]>([])
  const [message, setMessage] = useState('')

  async function loadIncome() {
    const { data, error } = await supabase
      .from('income_schedule')
      .select('*')
      .eq('is_active', true)

    if (error) {
      setMessage(error.message)
      return
    }

    setIncome(data || [])
  }

  useEffect(() => {
    loadIncome()
  }, [])

  const totalExpected =
    income.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    )

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">
        💵 Income Schedule
      </h1>

      <Nav />

      <div className="border rounded p-4">
        Modo seguro: esta página legacy está en solo lectura. Los cambios de
        ingresos se habilitarán desde un flujo autenticado y con ownership.
      </div>

      {message && (
        <div className="border rounded p-3">
          {message}
        </div>
      )}

      <div className="border rounded p-4">
        <h2 className="font-semibold">
          Próximos ingresos esperados
        </h2>

        <p className="text-3xl font-bold">
          ${totalExpected.toLocaleString()}
        </p>
      </div>

      <div className="space-y-4">
        {income.map((item) => (
          <IncomeCard
            key={item.id}
            item={item}
          />
        ))}
      </div>
    </main>
  )
}

function IncomeCard({
  item,
}: {
  item: any
}) {
  const [amount, setAmount] = useState(item.amount || 0)
  const [date, setDate] = useState(
    item.next_expected_date || ''
  )
  const [confidence, setConfidence] = useState(
    item.confidence || 'confirmed'
  )

  return (
    <div className="border rounded p-4 space-y-3">
      <h2 className="text-xl font-bold">
        {item.name}
      </h2>

      <p>Dueño: {item.owner}</p>

      <input
        type="number"
        className="border rounded p-2 w-full"
        value={amount}
        onChange={(e) =>
          setAmount(Number(e.target.value))
        }
      />

      <input
        type="date"
        className="border rounded p-2 w-full"
        value={date}
        onChange={(e) =>
          setDate(e.target.value)
        }
      />

      <select
        className="border rounded p-2 w-full"
        value={confidence}
        onChange={(e) =>
          setConfidence(e.target.value)
        }
      >
        <option value="confirmed">
          Confirmado
        </option>

        <option value="probable">
          Probable
        </option>

        <option value="possible">
          Posible
        </option>
      </select>

      <button
        className="border rounded p-2"
        disabled
      >
        Guardar deshabilitado
      </button>
    </div>
  )
}
