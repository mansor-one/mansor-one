'use client'

import { useEffect, useId, useState } from 'react'

export type ExplainableInsightData = {
  id: string
  label: string
  value: string
  detail?: string
  why: string
  classification: 'informativo' | 'riesgo'
  facts: Array<{ label: string; value: string }>
  related: Array<{ id: string; title: string; detail: string }>
  recommendations: Array<{ id: string; title: string; reason: string }>
}

const tone = {
  informativo: 'border-blue-700 bg-blue-950/40 text-blue-100',
  riesgo: 'border-red-700 bg-red-950/40 text-red-100',
}

export default function ExplainableInsight({ insight }: { insight: ExplainableInsightData }) {
  const [open, setOpen] = useState(false)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  return <>
    <button
      aria-haspopup="dialog"
      className="w-full rounded border border-neutral-800 p-3 text-left transition hover:border-neutral-500 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
      onClick={() => setOpen(true)}
      type="button"
    >
      <p className="text-xs text-neutral-500">{insight.label}</p>
      <p className="mt-1 font-bold">{insight.value}</p>
      {insight.detail ? <p className="text-sm text-neutral-400">{insight.detail}</p> : null}
      <p className="mt-2 text-xs font-semibold text-neutral-300">Ver explicación</p>
    </button>

    {open ? <div aria-labelledby={titleId} aria-modal="true" className="fixed inset-0 z-50" role="dialog">
      <button aria-label="Cerrar explicación" className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} type="button" />
      <aside className="mobile-safe-drawer absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-neutral-700 bg-neutral-950 p-5 text-neutral-100 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm text-neutral-400">Insight del Dashboard</p><h2 className="text-2xl font-bold" id={titleId}>{insight.value}</h2></div>
          <button className="min-h-11 min-w-11 rounded border border-neutral-600 px-3 py-2 text-sm" onClick={() => setOpen(false)} type="button">Cerrar</button>
        </div>

        <div className="mt-5 space-y-5 text-sm">
          <section><h3 className="font-bold">¿Por qué apareció?</h3><p className="mt-1 text-neutral-300">{insight.why}</p></section>
          <section><h3 className="font-bold">Tipo de insight</h3><span className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-semibold ${tone[insight.classification]}`}><span aria-hidden>{insight.classification === 'riesgo' ? '⚠' : 'ⓘ'}</span>{insight.classification === 'riesgo' ? 'Riesgo' : 'Informativo'}</span></section>
          <section><h3 className="font-bold">Datos usados</h3><dl className="mt-2 grid gap-2 sm:grid-cols-2">{insight.facts.map((fact) => <div className="rounded border border-neutral-800 p-3" key={`${fact.label}:${fact.value}`}><dt className="text-xs text-neutral-400">{fact.label}</dt><dd className="font-semibold">{fact.value}</dd></div>)}</dl></section>
          <section><h3 className="font-bold">Movimientos u obligaciones relacionadas</h3>{insight.related.length ? <ul className="mt-2 space-y-2">{insight.related.map((item) => <li className="rounded border border-neutral-800 p-3" key={item.id}><p className="font-semibold">{item.title}</p><p className="text-neutral-400">{item.detail}</p></li>)}</ul> : <p className="mt-1 text-neutral-400">No hay movimientos u obligaciones individuales relacionados.</p>}</section>
          <section><h3 className="font-bold">Recomendaciones de Robototina</h3>{insight.recommendations.length ? <ul className="mt-2 space-y-2">{insight.recommendations.map((item) => <li className="rounded border border-blue-900 bg-blue-950/30 p-3" key={item.id}><p className="font-semibold">{item.title}</p><p className="text-neutral-300">{item.reason}</p></li>)}</ul> : <p className="mt-1 text-neutral-400">Robototina no tiene una recomendación aplicable con el contexto actual.</p>}</section>
          <details className="rounded border border-neutral-800 p-3"><summary className="cursor-pointer font-semibold">Ver contexto estructurado</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-neutral-400">{JSON.stringify(insight, null, 2)}</pre></details>
        </div>
      </aside>
    </div> : null}
  </>
}
