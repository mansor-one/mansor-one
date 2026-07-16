import type { ReactNode } from 'react'
import PageHeader, { type PageHeaderProps } from './PageHeader'
import PrimaryNav from './PrimaryNav'

type AppShellProps = {
  children: ReactNode
  header?: PageHeaderProps
  maxWidth?: '6xl' | '7xl'
  tone?: 'default' | 'internal'
}

const maxWidthClass = {
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
}

export default function AppShell({
  children,
  header,
  maxWidth = '7xl',
  tone = 'default',
}: AppShellProps) {
  return (
    <main className="product-shell min-h-screen bg-[#050814] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_5%,rgba(99,102,241,0.20),transparent_28%),radial-gradient(circle_at_75%_0%,rgba(16,185,129,0.10),transparent_24%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,1)_58%)]" />
      <div className="relative flex min-h-screen flex-col lg:flex-row">
        <PrimaryNav />
        <div className="min-w-0 flex-1 px-4 py-5 md:px-7 lg:px-8 lg:py-7">
          <div className={`mx-auto flex w-full ${maxWidthClass[maxWidth]} flex-col gap-5`}>
            {header && <PageHeader {...header} />}
            <div
              className={
                tone === 'internal'
                  ? 'space-y-5'
                  : 'space-y-5 rounded-2xl border border-white/8 bg-white/[0.02] p-0 shadow-[0_24px_90px_rgba(0,0,0,0.18)] md:border-0 md:bg-transparent md:shadow-none'
              }
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
