'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function ReportActions({ month }: { month: string }) {
  const router = useRouter()
  const [selectedMonth, setSelectedMonth] = useState(month)

  function print(exporting = false) {
    const previousTitle = document.title
    if (exporting) document.title = `Mansor-One-${month}`
    window.print()
    if (exporting) window.setTimeout(() => { document.title = previousTitle }, 500)
  }

  return (
    <div className="report-actions flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-xs font-semibold text-slate-300">
        Mes del reporte
        <input
          className="rounded-lg border border-white/10 px-3 py-2 text-sm"
          defaultValue={month}
          max="2099-12"
          min="2020-01"
          onChange={(event) => setSelectedMonth(event.target.value)}
          type="month"
        />
      </label>
      <button className="rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-3 py-2 text-sm font-semibold text-indigo-100" onClick={() => router.push(`/reports?month=${selectedMonth}`)} type="button">Ver reporte</button>
      <button className="min-h-11 rounded-lg border border-white/10 bg-white/6 px-3 py-2 text-sm font-semibold" onClick={() => print()} type="button">Imprimir</button>
      <button className="min-h-11 rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white" onClick={() => print(true)} type="button">Imprimir / Guardar como PDF</button>
    </div>
  )
}
