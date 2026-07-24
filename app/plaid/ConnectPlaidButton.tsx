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
          headers: {
            'Content-Type': 'application/json',
          },
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
        console.error(error)
        setMessage('Error al conectar Plaid.')
      } finally {
        setLoading(false)
      }
    },
  })

  return (
    <div className="rounded border border-neutral-800 bg-neutral-900 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-neutral-400">Nueva conexión</p>
          <h2 className="text-xl font-bold text-neutral-100">
            Agregar banco o tarjeta
          </h2>
        </div>
        <button
          className="w-fit rounded border border-sky-700 bg-sky-950/50 px-4 py-3 text-sm font-medium text-sky-100 transition hover:border-sky-500 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-950 disabled:text-neutral-500"
          onClick={() => open()}
          disabled={!ready || !linkToken || loading}
        >
          {loading
            ? 'Conectando...'
            : linkToken
              ? 'Conectar con Plaid'
              : 'Cargando Plaid...'}
        </button>
      </div>

      {message && (
        <p className="mt-4 rounded border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-200">
          {message}
        </p>
      )}
    </div>
  )
}
