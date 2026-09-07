'use client'

import { useEffect, type ReactNode } from 'react'

export default function ContextualEntityTarget({
  active,
  children,
  entityId,
  focusEditor = false,
  label = 'Elemento seleccionado desde Pagos',
}: {
  active: boolean
  children: ReactNode
  entityId: string
  focusEditor?: boolean
  label?: string
}) {
  const elementId = `entity-${entityId}`

  useEffect(() => {
    if (!active) return
    const target = document.getElementById(elementId)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (focusEditor) {
      target.querySelector<HTMLElement>('input:not([type="hidden"]), select, button')?.focus()
    }
  }, [active, elementId, focusEditor])

  return (
    <div
      className={active ? 'rounded-xl ring-2 ring-indigo-400 ring-offset-4 ring-offset-[#08101f]' : undefined}
      data-contextual-target={active ? 'true' : undefined}
      id={elementId}
    >
      {active && (
        <p className="rounded-t-xl border-b border-indigo-300/20 bg-indigo-400/10 px-4 py-2 text-sm font-semibold text-indigo-100">
          {label}
        </p>
      )}
      {children}
    </div>
  )
}
