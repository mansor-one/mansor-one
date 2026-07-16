'use client'

import { useActionState, useState } from 'react'
import {
  analyzeImportEmailAction,
  type ImportPreviewState,
} from './actions'

const initialState: ImportPreviewState = {
  result: null,
  message: '',
}

export default function ImportsClient() {
  const [emailText, setEmailText] = useState('')
  const [state, formAction, isPending] = useActionState(
    analyzeImportEmailAction,
    initialState
  )

  return (
    <>
      {state.message && <div className="border rounded p-4">{state.message}</div>}

      <form action={formAction} className="space-y-6">
        <textarea
          className="border rounded p-3 w-full min-h-64"
          name="emailText"
          placeholder="Pega aquí el correo..."
          value={emailText}
          onChange={(event) => setEmailText(event.target.value)}
        />

        <button className="border rounded p-3" disabled={isPending} type="submit">
          {isPending ? 'Analizando...' : 'Analizar'}
        </button>
      </form>

      {state.result && (
        <div className="border rounded p-4 space-y-2">
          <p>
            <strong>Monto:</strong> {state.result.amount}
          </p>
          <p>
            <strong>Comercio detectado:</strong> {state.result.merchant}
          </p>
          <p>
            <strong>Categoría sugerida:</strong> {state.result.category}
          </p>
          <p>
            <strong>Tipo:</strong> {state.result.transactionType}
          </p>
          <p>
            <strong>Confianza:</strong> {state.result.confidence}
          </p>
        </div>
      )}
    </>
  )
}
