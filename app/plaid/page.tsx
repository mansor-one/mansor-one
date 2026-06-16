'use client'

import { useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import Nav from '../components/Nav'

export default function PlaidPage() {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setMounted(true)

    async function createLinkToken() {
      const response = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
      })

      const data = await response.json()

      if (data.error) {
        setMessage(data.error)
        return
      }

      setLinkToken(data.link_token)
    }

    createLinkToken()
  }, [])

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
        setMessage('Banco conectado correctamente ✅')
      } else {
        setMessage(data.error || 'No se pudo conectar Plaid.')
      }
    },
  })

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">🔗 Plaid</h1>

      <Nav />

      <p>
        Conecta una cuenta bancaria con Plaid. La conexión se guardará de forma segura en el servidor.
      </p>

      <button
        className="border rounded p-3"
        onClick={() => open()}
        disabled={!mounted || !ready || !linkToken}
      >
        {linkToken ? 'Conectar con Plaid' : 'Cargando Plaid...'}
      </button>

      {message && (
        <div className="border rounded p-4">
          {message}
        </div>
      )}
    </main>
  )
}