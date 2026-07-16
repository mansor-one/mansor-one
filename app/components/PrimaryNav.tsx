'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

type NavItem = {
  href: string
  label: string
  description?: string
  icon: string
}

const householdNav: NavItem[] = [
  { href: '/', label: 'Inicio', description: 'Resumen familiar', icon: '⌂' },
  { href: '/robototina', label: 'Robototina', description: 'Asesora', icon: '◉' },
  { href: '/spending', label: 'Gastos', description: 'Consumo', icon: '◔' },
  { href: '/history', label: 'Movimientos', description: 'Historial', icon: '▤' },
  { href: '/timeline', label: 'Pagos', description: 'Calendario', icon: '□' },
  { href: '/cards', label: 'Tarjetas', description: 'Crédito', icon: '▭' },
  { href: '/plaid', label: 'Bancos', description: 'Conexiones', icon: '▥' },
  { href: '/portfolio', label: 'Patrimonio', description: 'Cuentas', icon: '⌁' },
  { href: '/planning', label: 'Metas', description: 'Fondos', icon: '◎' },
]

const internalNav: NavItem[] = [
  { href: '/lab/review-queue', label: 'Financial Inbox', icon: '◇' },
  { href: '/dev/data-health', label: 'Data Health', icon: '◌' },
  { href: '/dev/household-contributions', label: 'Plan Familiar beta', icon: '◍' },
  { href: '/dev/confirmed-ledger-duplicates', label: 'Duplicados', icon: '⊕' },
  { href: '/dev/category-conflicts', label: 'Categorías', icon: '◈' },
  { href: '/lab', label: 'Lab', icon: '⌬' },
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function navClass(active: boolean) {
  return [
    'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
    active
      ? 'bg-indigo-500/18 text-white shadow-[0_0_24px_rgba(99,102,241,0.18)] ring-1 ring-indigo-400/20'
      : 'text-slate-300 hover:bg-white/7 hover:text-white',
  ].join(' ')
}

function NavGlyph({ children, active }: { children: string; active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'grid h-7 w-7 shrink-0 place-items-center rounded-md border text-sm',
        active
          ? 'border-indigo-300/25 bg-indigo-400/18 text-indigo-200'
          : 'border-white/8 bg-white/5 text-slate-400 group-hover:text-indigo-200',
      ].join(' ')}
    >
      {children}
    </span>
  )
}

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[]
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <>
      {items.map((item) => {
        const active = isActive(pathname, item.href)

        return (
          <Link
            aria-current={active ? 'page' : undefined}
            className={navClass(active)}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
            title={item.description}
          >
            <NavGlyph active={active}>{item.icon}</NavGlyph>
            <span>{item.label}</span>
          </Link>
        )
      })}
    </>
  )
}

export default function PrimaryNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const showInternal = pathname.startsWith('/dev') || pathname.startsWith('/lab')

  return (
    <nav className="lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[270px] lg:shrink-0 lg:flex-col lg:border-r lg:border-white/8 lg:bg-[#0b1220]/92 lg:px-5 lg:py-6 lg:shadow-[18px_0_60px_rgba(0,0,0,0.22)] lg:backdrop-blur">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0b1220]/92 px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.25)] backdrop-blur lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        <Link className="flex items-center gap-3" href="/">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-xl font-black text-white shadow-[0_0_32px_rgba(139,92,246,0.32)]">
            M
          </span>
          <span>
            <span className="block text-sm font-semibold text-white">Mansor One</span>
            <span className="block text-xs text-slate-400">Finanzas para el hogar</span>
          </span>
        </Link>
        <button
          aria-expanded={open}
          className="rounded-lg border border-white/10 bg-white/6 px-3 py-2 text-sm font-semibold text-slate-100 lg:hidden"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          Menú
        </button>
      </div>

      <div className="mt-8 hidden flex-1 flex-col gap-1 lg:flex">
        <NavLinks items={householdNav} pathname={pathname} />
      </div>

      {open && (
        <div className="mt-3 grid gap-1 rounded-2xl border border-white/10 bg-[#0b1220]/95 p-2 shadow-[0_18px_60px_rgba(0,0,0,0.25)] backdrop-blur lg:hidden">
          <NavLinks
            items={householdNav}
            onNavigate={() => setOpen(false)}
            pathname={pathname}
          />
        </div>
      )}

      {showInternal && (
        <div className="mt-4 border-t border-white/8 pt-4 lg:mt-6">
          <p className="px-3 text-xs font-semibold uppercase tracking-normal text-slate-500">
            Herramientas internas
          </p>
          <div className="mt-2 grid gap-1 lg:flex lg:flex-col">
            <NavLinks items={internalNav} pathname={pathname} />
          </div>
        </div>
      )}

      <div className="mt-auto hidden space-y-3 border-t border-white/8 pt-5 lg:block">
        <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-sm text-slate-300">
          <span>Modo oscuro</span>
          <span className="text-slate-500">›</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-3 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-500/30 text-sm font-semibold text-indigo-100">
            M
          </span>
          <span>
            <span className="block text-sm font-medium text-white">Manuel & Soraya</span>
            <span className="block text-xs text-slate-500">Cuenta familiar</span>
          </span>
        </div>
      </div>
    </nav>
  )
}
