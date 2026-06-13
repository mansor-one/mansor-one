'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [message, setMessage] = useState('')

  async function loadAccounts() {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) {
      setMessage(error.message)
      return
    }

    setAccounts(data || [])
  }

  async function updateBalance(id: string, balance: number) {
    const { error } = await supabase
      .from('accounts')
      .update({ balance })
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Balance actualizado ✅')
    loadAccounts()
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  const totalBalance = accounts.reduce(
    (sum, account) => sum + Number(account.balance || 0),
    0
  )

  const spendableBalance = accounts
    .filter((account) => account.is_spendable)
    .reduce((sum, account) => sum + Number(account.balance || 0), 0)

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">🏦 Cuentas</h1>

      <Nav />

      {message && <p>{message}</p>}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Balance Total</h2>
          <p className="text-3xl font-bold">
            ${totalBalance.toLocaleString()}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Disponible Hoy</h2>
          <p className="text-3xl font-bold">
            ${spendableBalance.toLocaleString()}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        {accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            onSave={updateBalance}
          />
        ))}
      </section>
    </main>
  )
}

function AccountCard({
  account,
  onSave,
}: {
  account: any
  onSave: (id: string, balance: number) => void
}) {
  const [balance, setBalance] = useState(account.balance || 0)

  return (
    <div className="border rounded p-4 space-y-3">
      <h2 className="text-xl font-semibold">{account.name}</h2>

      <p>Tipo: {account.account_type}</p>
      <p>Moneda: {account.currency}</p>
      <p>Disponible para gastar: {account.is_spendable ? 'Sí' : 'No'}</p>

      <input
        className="border rounded p-2 w-full"
        type="number"
        value={balance}
        onChange={(e) => setBalance(e.target.value)}
      />

      <button
        className="border rounded p-2"
        onClick={() => onSave(account.id, Number(balance))}
      >
        Guardar balance
      </button>
    </div>
  )
}