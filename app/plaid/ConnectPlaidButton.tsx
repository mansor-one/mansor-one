'use client'

import { useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'

export default function ConnectPlaidButton() {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
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
    token: linkToken || '',
    onSuccess: async (public_token, metadata) => {
      setLoading(true)
      try {
        const response = await fetch('/api/plaid/exchange-public-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            public_token,
            institution_name: metadata.institution?.name || 'Unknown',
          }),
        })

        const data = await response.json()

        if (data.access_token_received) {
          setMessage('Banco conectado correctamente ✅')
        } else {
          setMessage(data.error || 'No se pudo conectar Plaid.')
        }
      } catch (error) {
        setMessage('Error al conectar Plaid.')
      } finally {
        setLoading(false)
      }
    },
  })

  return (
    <div className="space-y-4 border rounded p-4">
      <button
        className="border rounded p-3"
        onClick={() => open()}
        disabled={!ready || !linkToken || loading}
      >
        {loading
          ? 'Conectando...'
          : linkToken
          ? 'Conectar con Plaid'
          : 'Cargando Plaid...'}
      </button>
      {message && <p>{message}</p>}
    </div>
  )
}