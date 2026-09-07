'use client'

import { useEffect, useState, type ReactNode } from 'react'

export default function FinancialHealthDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  return (
    <>
      <button
        aria-expanded={open}
        className="mt-3 inline-flex rounded border border-neutral-600 px-3 py-2 text-xs font-semibold transition hover:border-neutral-300 hover:bg-neutral-800"
        onClick={() => setOpen(true)}
        type="button"
      >
        Ver explicación financiera
      </button>

      {open ? (
        <div aria-modal="true" className="fixed inset-0 z-50" role="dialog">
          <button
            aria-label="Cerrar explicación financiera"
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpen(false)}
            type="button"
          />
          <aside className="mobile-safe-drawer absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-neutral-700 bg-neutral-950 p-5 text-neutral-100 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-neutral-400">Financial Health</p>
                <h2 className="text-2xl font-bold">Cómo se calcula tu estado</h2>
              </div>
              <button className="min-h-11 min-w-11 rounded border border-neutral-600 px-3 py-2 text-sm" onClick={() => setOpen(false)} type="button">
                Cerrar
              </button>
            </div>
            {children}
          </aside>
        </div>
      ) : null}
    </>
  )
}
