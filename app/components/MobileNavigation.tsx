'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const tabs = [
  { href: '/', label: 'Inicio', icon: '⌂' },
  { href: '/timeline', label: 'Pagos', icon: '□' },
  { href: '/robototina', label: 'Robototina', icon: '◉' },
  { href: '/history', label: 'Movimientos', icon: '▤' },
] as const

const moreLinks = [
  { href: '/cards', label: 'Tarjetas', icon: '▭' },
  { href: '/plaid', label: 'Bancos', icon: '▥' },
  { href: '/portfolio', label: 'Patrimonio', icon: '⌁' },
  { href: '/reports', label: 'Reportes', icon: '▦' },
  { href: '/planning', label: 'Metas', icon: '◎' },
  { href: '/repair-center', label: 'Reparaciones', icon: '◒' },
  { href: '/account', label: 'Mi cuenta', icon: '○' },
] as const

function active(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

export default function MobileNavigation() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const firstLinkRef = useRef<HTMLAnchorElement>(null)
  const sheetRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 64rem)')
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false) }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  useEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    firstLinkRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
      if (event.key === 'Tab') {
        const focusable = [...(sheetRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') || [])]
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      trigger?.focus()
    }
  }, [open])

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    setSignOutError('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut({ scope: 'global' })
      if (error) throw error
      window.location.replace('/login')
    } catch {
      setSignOutError('No pudimos cerrar la sesión. Comprueba tu conexión e inténtalo de nuevo.')
      setSigningOut(false)
    }
  }

  const moreActive = moreLinks.some((item) => active(pathname, item.href))

  return <>
    <div role="navigation" className="mobile-bottom-nav lg:hidden" aria-label="Navegación principal móvil">
      {tabs.map((item) => {
        const selected = active(pathname, item.href)
        return <Link aria-current={selected ? 'page' : undefined} className={selected ? 'mobile-nav-item mobile-nav-item-active' : 'mobile-nav-item'} prefetch={false} href={item.href} key={item.href}><span aria-hidden="true" className="text-lg leading-none">{item.icon}</span><span>{item.label}</span></Link>
      })}
      <button aria-controls="mobile-more-dialog" aria-expanded={open} aria-haspopup="dialog" className={moreActive || open ? 'mobile-nav-item mobile-nav-item-active' : 'mobile-nav-item'} onClick={() => setOpen(true)} ref={triggerRef} type="button"><span aria-hidden="true" className="text-lg leading-none">•••</span><span>Más</span></button>
    </div>
    {open && <div id="mobile-more-dialog" aria-labelledby="mobile-more-title" aria-modal="true" className="fixed inset-0 z-[70] lg:hidden" role="dialog">
      <button aria-label="Cerrar menú" tabIndex={-1} className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} type="button" />
      <section className="mobile-more-sheet absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-white/10 bg-[#0b1220] px-4 pt-4 shadow-[0_-24px_80px_rgba(0,0,0,0.5)]" ref={sheetRef}>
        <div className="mb-3 flex min-h-11 items-center justify-between gap-3"><h2 className="text-lg font-bold text-white" id="mobile-more-title">Más en Mansor One</h2><button aria-label="Cerrar menú Más" className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/10 text-slate-200" onClick={() => setOpen(false)} type="button">×</button></div>
        <nav aria-label="Más destinos" className="grid grid-cols-2 gap-2">
          {moreLinks.map((item, index) => <Link aria-current={active(pathname, item.href) ? 'page' : undefined} className="flex min-h-12 items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-sm font-semibold text-slate-100" prefetch={false} href={item.href} key={item.href} onClick={() => setOpen(false)} ref={index === 0 ? firstLinkRef : undefined}><span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500/15 text-indigo-200">{item.icon}</span>{item.label}</Link>)}
        </nav>
        <button className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl border border-rose-300/20 bg-rose-400/8 px-4 py-3 text-sm font-semibold text-rose-100 disabled:opacity-60" disabled={signingOut} onClick={signOut} type="button">{signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
        {signOutError && <p className="mt-3 text-sm text-rose-200" role="alert">{signOutError}</p>}
      </section>
    </div>}
  </>
}
