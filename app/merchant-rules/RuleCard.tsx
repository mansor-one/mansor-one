'use client'

import { useState } from 'react'
import { updateMerchantRuleAction } from './actions'

export type MerchantRule = {
  id: string
  merchant_keyword: string | null
  suggested_category: string | null
  default_transaction_type: string | null
  confidence_score: number | string | null
  notes: string | null
}

export default function RuleCard({ rule }: { rule: MerchantRule }) {
  const [category, setCategory] = useState(rule.suggested_category || '')

  return (
    <form action={updateMerchantRuleAction} className="space-y-2 rounded border p-4">
      <input name="ruleId" type="hidden" value={rule.id} />
      <h2 className="text-xl font-bold">{rule.merchant_keyword}</h2>

      <p>Tipo: {rule.default_transaction_type}</p>
      <p>Confianza: {rule.confidence_score}</p>
      <p>Notas: {rule.notes || 'N/A'}</p>

      <input
        className="w-full rounded border p-2"
        name="suggestedCategory"
        onChange={(event) => setCategory(event.target.value)}
        placeholder="Categoría sugerida"
        value={category}
      />

      <button className="rounded border p-2" type="submit">
        Guardar
      </button>
    </form>
  )
}
