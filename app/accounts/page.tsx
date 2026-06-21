'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

function money(value: number) {
  return `$${Number(value || 0).toLocaleString()}`
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [plaidAccounts, setPlaidAccounts] = useState<any[]>([])
  const [message, setMessage] = useState('')

  async function loadAccounts() {
    const { data: manualData, error: manualError } = await supabase
      .from('accounts')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (manualError) {
      setMessage(manualError.message)
      return
    }

    const { data: plaidData, error: plaidError } = await supabase
      .from('plaid_accounts')
      .select('*')
      .order('name', { ascending: true })

    if (plaidError) {
      setMessage(plaidError.message)
      return
    }

    setAccounts(manualData || [])
    setPlaidAccounts(plaidData || [])
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

  async function syncPlaidAccounts() {
    setMessage('Actualizando balances de Plaid...')

    const response = await fetch('/api/plaid/sync-accounts', {
      method: 'POST',
    })

    const data = await response.json()

    if (data.error) {
      setMessage(data.error)
      return
    }

    setMessage(`Balances actualizados ✅ Cuentas: ${data.synced_accounts}`)
    loadAccounts()
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  const manualTotalBalance = accounts.reduce(
    (sum, account) => sum + Number(account.balance || 0),
    0
  )

  const manualSpendableBalance = accounts
    .filter((account) => account.is_spendable)
    .reduce((sum, account) => sum + Number(account.balance || 0), 0)

  const plaidCashAccounts = plaidAccounts.filter(
    (account) => account.type === 'depository'
  )

  const plaidCreditAccounts = plaidAccounts.filter(
    (account) => account.type === 'credit'
  )

  const plaidCashAvailableBalance = plaidCashAccounts.reduce(
    (sum, account) => sum + Number(account.available_balance || 0),
    0
  )

  const plaidCashCurrentBalance = plaidCashAccounts.reduce(
    (sum, account) => sum + Number(account.current_balance || 0),
    0
  )

  const plaidCreditAvailableBalance = plaidCreditAccounts.reduce(
    (sum, account) => sum + Number(account.available_balance || 0),
    0
  )

  const plaidCreditDebtBalance = plaidCreditAccounts.reduce(
    (sum, account) => sum + Number(account.current_balance || 0),
    0
  )

  type PlaidAccount = typeof plaidAccounts[number]

  const plaidByInstitution = plaidAccounts.reduce(
    (acc, account) => {
      const institution = account.institution_name || 'Unknown'
      if (!acc[institution]) acc[institution] = []
      acc[institution].push(account)
      return acc
    }, {} as Record<string, PlaidAccount[]>)

  const plaidInstitutionEntries = Object.entries(
    plaidByInstitution
  ) as [string, PlaidAccount[]][]

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">🏦 Cuentas</h1>

      <Nav />

      <button className="border rounded p-3" onClick={syncPlaidAccounts}>
        🔄 Actualizar balances Plaid
      </button>

      {message && <p>{message}</p>}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Cash Disponible Plaid</h2>
          <p className="text-3xl font-bold">
            {money(plaidCashAvailableBalance)}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Cash Actual Plaid</h2>
          <p className="text-3xl font-bold">
            {money(plaidCashCurrentBalance)}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Crédito Disponible</h2>
          <p className="text-3xl font-bold">
            {money(plaidCreditAvailableBalance)}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Deuda Tarjetas Plaid</h2>
          <p className="text-3xl font-bold">
            {money(plaidCreditDebtBalance)}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Balance Manual</h2>
          <p className="text-3xl font-bold">
            {money(manualTotalBalance)}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Manual Disponible</h2>
          <p className="text-3xl font-bold">
            {money(manualSpendableBalance)}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Cuentas Plaid</h2>

        {plaidInstitutionEntries.map(([institution, accounts]) => (
          <div key={institution} className="border rounded p-4 space-y-4">
            <h3 className="text-xl font-semibold">{institution}</h3>
            <div className="space-y-3">
              {accounts.map((account) => (
                <div key={account.id} className="border rounded p-4 space-y-2">
                  <h4 className="font-semibold">{account.name}</h4>
                  <p>Tipo: {account.type}</p>
                  <p>Subtipo: {account.subtype}</p>

                  {account.type === 'credit' ? (
                    <>
                      <p>Crédito disponible: {money(account.available_balance)}</p>
                      <p>Balance adeudado: {money(account.current_balance)}</p>
                    </>
                  ) : (
                    <>
                      <p>Disponible: {money(account.available_balance)}</p>
                      <p>Balance actual: {money(account.current_balance)}</p>
                    </>
                  )}

                  <p>Actualizado: {account.updated_at}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Cuentas Manuales</h2>

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