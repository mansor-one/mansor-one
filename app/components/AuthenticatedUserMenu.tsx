'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

async function loadAccountIdentity() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: membership } = await supabase
    .from('household_members')
    .select('name, household_id')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .maybeSingle()
  if (!membership) return null
  const { data: household } = await supabase
    .from('households')
    .select('name')
    .eq('id', membership.household_id)
    .maybeSingle()
  return {
    displayName: membership.name || 'Mi cuenta',
    householdName: household?.name || 'Mansor One',
  }
}

export default function AuthenticatedUserMenu() {
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const [displayName, setDisplayName] = useState('Mi cuenta')
  const [householdName, setHouseholdName] = useState('Mansor One')

  useEffect(() => {
    let active = true
    function refreshIdentity() {
      void loadAccountIdentity().then((identity) => {
        if (!active || !identity) return
        setDisplayName(identity.displayName)
        setHouseholdName(identity.householdName)
      })
    }
    refreshIdentity()
    window.addEventListener('mansor:account-updated', refreshIdentity)
    return () => {
      active = false
      window.removeEventListener('mansor:account-updated', refreshIdentity)
    }
  }, [])

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
          {displayName.trim().charAt(0).toUpperCase() || '?'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white">
            {displayName}
          </span>
          <span className="block truncate text-xs text-slate-500">{householdName}</span>
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
          <Link className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-200 transition hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" href="/account" onClick={() => setOpen(false)} role="menuitem">
            <span aria-hidden="true">○</span> Mi cuenta
          </Link>
          <Link className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-200 transition hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" href="/account#preferences" onClick={() => setOpen(false)} role="menuitem">
            <span aria-hidden="true">⚙</span> Configuración
          </Link>
          <Link className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-200 transition hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" href="/account#security" onClick={() => setOpen(false)} role="menuitem">
            <span aria-hidden="true">◇</span> Seguridad
          </Link>
          <div className="my-1 border-t border-white/8" />
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
