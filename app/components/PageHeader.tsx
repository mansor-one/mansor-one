import Link from 'next/link'
import type { ReactNode } from 'react'

export type PageHeaderProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  backHref?: string
  backLabel?: string
  breadcrumb?: Array<{ label: string; href?: string }>
  primaryAction?: ReactNode
  secondaryAction?: ReactNode
  statusBadge?: ReactNode
}

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  backHref,
  backLabel = 'Volver',
  breadcrumb,
  primaryAction,
  secondaryAction,
  statusBadge,
}: PageHeaderProps) {
  return (
    <header className="rounded-2xl border border-white/8 bg-white/[0.035] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur md:p-6">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="mb-3 flex flex-wrap gap-2 text-xs text-slate-500">
          {breadcrumb.map((item, index) => (
            <span className="flex items-center gap-2" key={`${index}-${item.label}`}>
              {item.href ? (
                <Link className="font-medium text-slate-400 hover:text-white" href={item.href}>
                  {item.label}
                </Link>
              ) : (
                <span>{item.label}</span>
              )}
              {index < breadcrumb.length - 1 && <span>/</span>}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          {backHref && (
            <Link className="text-sm font-medium text-slate-400 hover:text-white" href={backHref}>
              {backLabel}
            </Link>
          )}
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-normal text-violet-300">
              {eyebrow}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-normal text-white md:text-4xl">
              {title}
            </h1>
            {statusBadge}
          </div>
          {subtitle && (
            <p className="max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
              {subtitle}
            </p>
          )}
        </div>

        {(primaryAction || secondaryAction) && (
          <div className="flex flex-wrap gap-2">
            {secondaryAction}
            {primaryAction}
          </div>
        )}
      </div>
    </header>
  )
}
