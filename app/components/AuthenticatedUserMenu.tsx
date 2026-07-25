'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AuthenticatedUserMenu() {
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')

  async function signOut() {
    if (signingOut) return

    setSigningOut(true)
    setError('')

    const supabase = createClient()
    const { error: signOutError } = await supabase.auth.signOut({
      scope: 'global',
    })

    if (signOutError) {
      setError('No pudimos cerrar la sesión. Inténtalo de nuevo.')
      setSigningOut(false)
      return
    }

    // A hard replacement discards React state and the Next.js client Router
    // Cache. Supabase signOut removes its persisted browser session.
    window.location.replace('/login')
  }

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-left transition hover:border-indigo-300/20 hover:bg-white/7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        onClick={() => {
          setOpen((value) => !value)
          setError('')
        }}
        type="button"
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-500/30 text-sm font-semibold text-indigo-100">
          M
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white">
            Manuel &amp; Soraya
          </span>
          <span className="block text-xs text-slate-500">Cuenta familiar</span>
        </span>
        <span aria-hidden="true" className="text-xs text-slate-400">
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div
          aria-label="Menú de usuario"
          className="mt-2 rounded-xl border border-white/10 bg-[#111a2b] p-2 shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
          role="menu"
        >
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-200 transition hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait disabled:opacity-60"
            disabled={signingOut}
            onClick={signOut}
            role="menuitem"
            type="button"
          >
            <span aria-hidden="true">↪</span>
            {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
          {error && (
            <p className="px-3 pb-1 pt-2 text-xs text-rose-300" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
