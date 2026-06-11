'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function QuickEntryPage() {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [entryType, setEntryType] = useState('expense')
  const [owner, setOwner] = useState('Manuel')
  const [message, setMessage] = useState('')

  async function saveEntry() {
    const { error } = await supabase.from('quick_entries').insert({
      description,
      amount: Number(amount),
      entry_type: entryType,
      owner,
      source: 'manual'
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setDescription('')
    setAmount('')
    setMessage('Entrada guardada ✅')
  }

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">⚡ Quick Entry</h1>

      <div className="space-y-4 max-w-md">
        <select
          className="border rounded p-2 w-full"
          value={entryType}
          onChange={(e) => setEntryType(e.target.value)}
        >
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
          <option value="payment">Pago</option>
          <option value="transfer">Transferencia</option>
        </select>

        <input
          className="border rounded p-2 w-full"
          placeholder="Descripción: Gasté en Subway"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <input
          className="border rounded p-2 w-full"
          placeholder="Monto"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <select
          className="border rounded p-2 w-full"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="Manuel">Manuel</option>
          <option value="Soraya">Soraya</option>
        </select>

        <button
          className="border rounded p-2 w-full"
          onClick={saveEntry}
        >
          Guardar
        </button>

        {message && <p>{message}</p>}
      </div>
    </main>
  )
}
