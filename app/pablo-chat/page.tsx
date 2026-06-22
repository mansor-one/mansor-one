'use client'

import { useState } from 'react'
import Nav from '@/app/components/Nav'

export default function PabloChatPage() {
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<Array<{ q: string; a: string }>>([])
  const [loading, setLoading] = useState(false)

  async function ask() {
    if (!question.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/pablo/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const data = await res.json()
      const ans = data.answer || data.error || 'Error en la respuesta'
      setHistory((h) => [{ q: question, a: ans }, ...h])
      setQuestion('')
    } catch (e) {
      setHistory((h) => [{ q: question, a: 'Error de conexión' }, ...h])
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="p-8 space-y-4">
      <h1 className="text-3xl font-bold">🤖 Hablar con Pablo</h1>
      <Nav />

      <section className="border rounded p-4">
        <textarea
          className="w-full border rounded p-3 min-h-28"
          placeholder="Escribe tu pregunta a Pablo... Ej: ¿Puedo pagar Honda hoy?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="flex gap-2 mt-2">
          <button className="border rounded p-2" onClick={ask} disabled={loading}>
            {loading ? 'Pensando...' : 'Preguntar'}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Historial</h2>
        {history.length === 0 && <p className="opacity-70">No hay interacciones todavía.</p>}
        <div className="space-y-2">
          {history.map((h, i) => (
            <div key={i} className="border rounded p-3">
              <p className="font-semibold">Q: {h.q}</p>
              <p className="mt-2">A: {h.a}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
