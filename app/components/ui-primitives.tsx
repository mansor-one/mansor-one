import type { ReactNode } from 'react'

export function KpiCard({
  label,
  value,
  helper,
}: {
  label: string
  value: ReactNode
  helper?: string
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.045] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur">
      <p className="text-sm font-medium text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {helper && <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>}
    </div>
  )
}

export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'critical' | 'info'
}) {
  const classes = {
    neutral: 'border-white/10 bg-white/6 text-slate-300',
    success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    warning: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
    critical: 'border-red-400/20 bg-red-400/10 text-red-300',
    info: 'border-sky-400/20 bg-sky-400/10 text-sky-300',
  }

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${classes[tone]}`}>
      {children}
    </span>
  )
}

export function InlineNotice({
  children,
  tone = 'info',
}: {
  children: ReactNode
  tone?: 'info' | 'success' | 'warning' | 'critical'
}) {
  const classes = {
    info: 'border-sky-400/20 bg-sky-400/10 text-sky-100',
    success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
    warning: 'border-amber-400/20 bg-amber-400/10 text-amber-100',
    critical: 'border-red-400/20 bg-red-400/10 text-red-100',
  }

  return (
    <div className={`rounded-lg border p-4 text-sm leading-6 ${classes[tone]}`}>
      {children}
    </div>
  )
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.035] p-6 text-center">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
        {message}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>
}

export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2 rounded-2xl border border-white/8 bg-white/[0.035] p-4">
      {Array.from({ length: lines }).map((_, index) => (
        <div
          className="h-3 animate-pulse rounded bg-white/10"
          key={index}
          style={{ width: `${90 - index * 14}%` }}
        />
      ))}
    </div>
  )
}
