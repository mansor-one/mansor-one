'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default function MerchantRulesPage() {
  const [rules, setRules] = useState<any[]>([])
  const [message, setMessage] = useState('')

  async function loadRules() {
    const { data, error } = await supabase
      .from('merchant_rules')
      .select('*')
      .order('merchant_keyword')

    if (error) {
      setMessage(error.message)
      return
    }

    setRules(data || [])
  }

  async function updateRule(id: string, suggested_category: string) {
    setMessage('Guardando regla...')

    const { error } = await supabase
      .from('merchant_rules')
      .update({ suggested_category })
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Regla actualizada ✅')
    loadRules()
  }

  useEffect(() => {
    loadRules()
  }, [])

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">🧠 Merchant Rules</h1>

      <Nav />
      <p>Total reglas: {rules.length}</p>

      {message && (
        <div className="border rounded p-4">
          {message}
        </div>
      )}

      <section className="space-y-3">
        {rules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            onSave={updateRule}
          />
        ))}
      </section>
    </main>
  )
}

function RuleCard({
  rule,
  onSave,
}: {
  rule: any
  onSave: (id: string, category: string) => void
}) {
  const [category, setCategory] = useState(rule.suggested_category || '')

  return (
    <div className="border rounded p-4 space-y-2">
      <h2 className="text-xl font-bold">{rule.merchant_keyword}</h2>

      <p>Tipo: {rule.default_transaction_type}</p>
      <p>Confianza: {rule.confidence_score}</p>
      <p>Notas: {rule.notes || 'N/A'}</p>

      <input
        className="border rounded p-2 w-full"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Categoría sugerida"
      />

      <button
        className="border rounded p-2"
        onClick={() => onSave(rule.id, category)}
      >
        Guardar
      </button>
    </div>
  )
}