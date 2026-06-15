'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default function ImportsPage() {
  const [emailText, setEmailText] = useState('')
  const [result, setResult] = useState<any>(null)
  const [message, setMessage] = useState('')

  async function analyze() {
    const lower = emailText.toLowerCase()

    let amount = 'No detectado'
    let category = 'Sin categoría'
    let merchant = 'No detectado'
    let transactionType = 'expense'
    let confidence = 0

    const totalMatch = emailText.match(
      /total[\s\S]{0,80}?\$([\d,]+\.\d{2})/i
    )

    if (totalMatch) {
      amount = `$${totalMatch[1]}`
    } else {
      const amountMatch = emailText.match(/\$[\d,]+\.\d{2}/)
      amount = amountMatch ? amountMatch[0] : 'No detectado'
    }

    const { data: rules, error } = await supabase
      .from('merchant_rules')
      .select('*')
      .order('confidence_score', { ascending: false })

    if (error) {
      setMessage(error.message)
      return
    }

    const matchedRule = rules?.find((rule) =>
      lower.includes(String(rule.merchant_keyword || '').toLowerCase())
    )

    if (matchedRule) {
      merchant = matchedRule.merchant_keyword
      category = matchedRule.suggested_category || 'Sin categoría'
      transactionType = matchedRule.default_transaction_type || 'expense'
      confidence = Number(matchedRule.confidence_score || 0)
    }

    setResult({
      amount,
      merchant,
      category,
      transactionType,
      confidence,
    })
  }

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">📥 Email Import Preview</h1>

      <Nav />

      {message && (
        <div className="border rounded p-4">
          {message}
        </div>
      )}

      <textarea
        className="border rounded p-3 w-full min-h-64"
        placeholder="Pega aquí el correo..."
        value={emailText}
        onChange={(e) => setEmailText(e.target.value)}
      />

      <button className="border rounded p-3" onClick={analyze}>
        Analizar
      </button>

      {result && (
        <div className="border rounded p-4 space-y-2">
          <p><strong>Monto:</strong> {result.amount}</p>
          <p><strong>Comercio detectado:</strong> {result.merchant}</p>
          <p><strong>Categoría sugerida:</strong> {result.category}</p>
          <p><strong>Tipo:</strong> {result.transactionType}</p>
          <p><strong>Confianza:</strong> {result.confidence}</p>
        </div>
      )}
    </main>
  )
}