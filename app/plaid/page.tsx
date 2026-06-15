'use client'

import { useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import Nav from '../components/Nav'

export default function PlaidPage() {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState('')
  const [accounts, setAccounts] = useState<any[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function createLinkToken() {
      const response = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
      })

      const data = await response.json()
      setLinkToken(data.link_token)
    }

    createLinkToken()
  }, [])

  async function loadAccounts(token: string) {
    const response = await fetch('/api/plaid/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token }),
    })

    const data = await response.json()

    if (data.error) {
      setMessage(data.error)
      return
    }

    setAccounts(data.accounts || [])
  }

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token) => {
      const response = await fetch('/api/plaid/exchange-public-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token }),
      })

      const data = await response.json()

      if (data.access_token_received) {
        setAccessToken(data.access_token)
        setMessage('Plaid conectado correctamente ✅')
        loadAccounts(data.access_token)
      } else {
        setMessage('No se pudo conectar Plaid.')
      }
    },
  })

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">🔗 Plaid</h1>

      <Nav />

      <p>
        Conecta una cuenta de prueba en Plaid Sandbox para validar balances y transacciones.
      </p>

      <button
        className="border rounded p-3"
        onClick={() => open()}
        disabled={!ready}
      >
        Conectar con Plaid
      </button>

      {message && (
        <div className="border rounded p-4">
          {message}
        </div>
      )}

      {accessToken && (
        <div className="border rounded p-4">
          <h2 className="font-bold">Access Token recibido</h2>
          <p>Sandbox token activo ✅</p>
        </div>
      )}

      {accounts.length > 0 && (
        <section className="border rounded p-4">
          <h2 className="text-2xl font-bold mb-4">Cuentas Plaid</h2>

          <div className="space-y-3">
            {accounts.map((account) => (
              <div key={account.account_id} className="border rounded p-4">
                <h3 className="font-bold">{account.name}</h3>
                <p>Tipo: {account.type}</p>
                <p>Subtipo: {account.subtype}</p>
                <p>
                  Balance disponible: $
                  {Number(account.balances.available || 0).toLocaleString()}
                </p>
                <p>
                  Balance actual: $
                  {Number(account.balances.current || 0).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}