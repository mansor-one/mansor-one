'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default function PlaidImportPage() {
  const [imports, setImports] = useState<any[]>([])
  const [message, setMessage] = useState('')

  async function loadImports() {
    const { data, error } = await supabase
      .from('plaid_imports')
      .select('*')
      .order('transaction_date', { ascending: false })
      .limit(100)

    if (error) {
      setMessage(error.message)
      return
    }

    setImports(data || [])
  }

  async function syncPlaid() {
    setMessage('Sincronizando Plaid...')

    const response = await fetch('/api/plaid/sync-imports', {
      method: 'POST',
    })

    const data = await response.json()

    if (data.error) {
      setMessage(data.error)
      return
    }

    setMessage(`Sincronización completada. Transacciones recibidas: ${data.imported_count}`)
    loadImports()
  }

  useEffect(() => {
    loadImports()
  }, [])

  const pending = imports.filter((item) => !item.imported)
  const imported = imports.filter((item) => item.imported)

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">📥 Plaid Import</h1>

      <Nav />

      <button
        className="border rounded p-3"
        onClick={syncPlaid}
      >
        🔄 Sincronizar Plaid
      </button>

      {message && (
        <div className="border rounded p-4">
          {message}
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Pendientes</h2>
          <p className="text-3xl font-bold">{pending.length}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Importadas</h2>
          <p className="text-3xl font-bold">{imported.length}</p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Total en revisión</h2>
          <p className="text-3xl font-bold">{imports.length}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Transacciones pendientes</h2>

        {pending.map((item) => (
          <div key={item.id} className="border rounded p-4 space-y-1">
            <h3 className="font-bold">{item.merchant}</h3>

            <p>Fecha: {item.transaction_date}</p>

            <p>
              Monto: ${Number(item.amount || 0).toLocaleString()}
            </p>

            <p>Categoría Plaid: {item.plaid_category || 'N/A'}</p>

            <p>
              Categoría Mansor sugerida:{' '}
              {item.suggested_category || 'Revisar'}
            </p>

            <p>
              Estado:{' '}
              {item.imported ? 'Importada' : 'Pendiente'}
            </p>
          </div>
        ))}
      </section>
    </main>
  )
}