'use client'

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default function QuickEntryPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [accountId, setAccountId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [entryType, setEntryType] = useState('expense')
  const [owner, setOwner] = useState('Manuel')
  const [category, setCategory] = useState('Comida')
  const message = ''

  async function loadAccounts() {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('is_active', true)
      .eq('is_spendable', true)
      .order('name', { ascending: true })

    setAccounts(data || [])
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">⚡ Quick Entry</h1>

      <Nav />

      <div className="border rounded p-4">
        Modo seguro: esta página legacy está en solo lectura. Las entradas
        manuales deben pasar por un flujo autenticado antes de escribir al
        historial.
      </div>

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

        <select
          className="border rounded p-2 w-full"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">Selecciona cuenta</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} - ${Number(account.balance || 0).toLocaleString()}
            </option>
          ))}
        </select>

        <input
          className="border rounded p-2 w-full"
          placeholder="Descripción"
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
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="Comida">🍔 Comida</option>
          <option value="Gasolina">⛽ Gasolina</option>
          <option value="Casa">🏠 Casa</option>
          <option value="Colegio">🎓 Colegio</option>
          <option value="AutoExpreso">🚗 AutoExpreso</option>
          <option value="Salud">🏥 Salud</option>
          <option value="Entretenimiento">🎬 Entretenimiento</option>
          <option value="Niñas">👧 Niñas</option>
          <option value="Carro">🔧 Carro</option>
          <option value="Otros">📦 Otros</option>
        </select>

        <select
          className="border rounded p-2 w-full"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="Manuel">Manuel</option>
          <option value="Soraya">Soraya</option>
        </select>

        <button className="border rounded p-2 w-full" disabled>
          Guardar deshabilitado
        </button>

        {message && <p>{message}</p>}
      </div>
    </main>
  )
}
