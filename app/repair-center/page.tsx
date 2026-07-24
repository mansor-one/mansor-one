import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import {
  buildHealthCenterReport,
  buildRepairCenterReport,
  getDataHealthReport,
  type RepairCenterArea,
  type RepairCenterItem,
  type RepairCenterStatus,
} from '@/lib/financial-engine'
import AppShell from '../components/AppShell'
import { KpiCard, StatusBadge } from '../components/ui-primitives'

export const dynamic = 'force-dynamic'

type RepairCenterPageProps = {
  searchParams?: Promise<{
    area?: string
    severity?: string
    repairType?: string
    status?: string
  }>
}

const AREA_OPTIONS: RepairCenterArea[] = [
  'Cards',
  'Transfers',
  'Income',
  'Plaid',
  'Accounts',
  'Planning',
  'Portfolio',
  'Snapshot',
]

const STATUS_LABELS: Record<RepairCenterStatus, string> = {
  pending_review: 'Pending Review',
  ready_to_repair: 'Ready to Repair',
  user_confirmation_required: 'User Confirmation Required',
  waiting_for_external_sync: 'Waiting for External Sync',
  completed: 'Completed',
  ignored: 'Ignored',
}

function toneForScore(score: number): 'success' | 'warning' | 'critical' {
  if (score >= 85) return 'success'
  if (score >= 65) return 'warning'
  return 'critical'
}

function severityTone(
  severity: RepairCenterItem['severity']
): 'success' | 'warning' | 'critical' | 'neutral' {
  if (severity === 'critical') return 'critical'
  if (severity === 'warning' || severity === 'unknown') return 'warning'
  return 'success'
}

function statusTone(
  status: RepairCenterStatus
): 'success' | 'warning' | 'critical' | 'info' | 'neutral' {
  if (status === 'completed') return 'success'
  if (status === 'ready_to_repair') return 'info'
  if (status === 'user_confirmation_required') return 'warning'
  if (status === 'waiting_for_external_sync') return 'warning'
  if (status === 'ignored') return 'neutral'
  return 'neutral'
}

function repairTypeLabel(type: RepairCenterItem['repairType']) {
  if (type === 'automatic_repairable') return 'Reviewable repair'
  if (type === 'requires_user_input') return 'Metadata update'
  if (type === 'requires_external_sync') return 'External sync'
  return 'Information only'
}

function matchesFilter(value: string | undefined, expected: string) {
  return !value || value === 'all' || value === expected
}

function filterHref(key: string, value: string) {
  return `/repair-center?${key}=${encodeURIComponent(value)}`
}

function SectionSummary({
  title,
  healthScore,
  findingCount,
  criticalCount,
  warningCount,
  progress,
}: {
  title: string
  healthScore: number
  findingCount: number
  criticalCount: number
  warningCount: number
  progress: number
}) {
  return (
    <article className="rounded-2xl border border-white/8 bg-white/[0.045] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-slate-400">{findingCount} open findings</p>
        </div>
        <StatusBadge tone={toneForScore(healthScore)}>{healthScore}/100</StatusBadge>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <StatusBadge tone={criticalCount > 0 ? 'critical' : 'neutral'}>
          {criticalCount} critical
        </StatusBadge>
        <StatusBadge tone={warningCount > 0 ? 'warning' : 'neutral'}>
          {warningCount} warnings
        </StatusBadge>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-emerald-400"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">{progress}% reviewed</p>
    </article>
  )
}

function FilterBar({
  area,
  severity,
  repairType,
  status,
}: {
  area?: string
  severity?: string
  repairType?: string
  status?: string
}) {
  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
      <div className="flex flex-wrap gap-2">
        <Link className="rounded-lg border border-white/10 px-3 py-2 text-sm" href="/repair-center">
          All
        </Link>
        {AREA_OPTIONS.map((option) => (
          <Link
            className={[
              'rounded-lg border px-3 py-2 text-sm',
              area === option
                ? 'border-indigo-300/40 bg-indigo-400/15 text-white'
                : 'border-white/10 text-slate-300',
            ].join(' ')}
            href={filterHref('area', option)}
            key={option}
          >
            {option}
          </Link>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {['critical', 'warning', 'unknown', 'healthy'].map((option) => (
          <Link
            className={[
              'rounded-full border px-3 py-1.5',
              severity === option
                ? 'border-amber-300/40 bg-amber-400/15 text-white'
                : 'border-white/10 text-slate-400',
            ].join(' ')}
            href={filterHref('severity', option)}
            key={option}
          >
            {option}
          </Link>
        ))}
        {['automatic_repairable', 'requires_user_input', 'requires_external_sync'].map(
          (option) => (
            <Link
              className={[
                'rounded-full border px-3 py-1.5',
                repairType === option
                  ? 'border-sky-300/40 bg-sky-400/15 text-white'
                  : 'border-white/10 text-slate-400',
              ].join(' ')}
              href={filterHref('repairType', option)}
              key={option}
            >
              {repairTypeLabel(option as RepairCenterItem['repairType'])}
            </Link>
          )
        )}
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <Link
            className={[
              'rounded-full border px-3 py-1.5',
              status === value
                ? 'border-emerald-300/40 bg-emerald-400/15 text-white'
                : 'border-white/10 text-slate-400',
            ].join(' ')}
            href={filterHref('status', value)}
            key={value}
          >
            {label}
          </Link>
        ))}
      </div>
    </section>
  )
}

function RepairItemCard({ item }: { item: RepairCenterItem }) {
  return (
    <article className="rounded-2xl border border-white/8 bg-white/[0.045] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={severityTone(item.severity)}>{item.severity}</StatusBadge>
            <StatusBadge tone={statusTone(item.status)}>
              {STATUS_LABELS[item.status]}
            </StatusBadge>
            <StatusBadge tone="neutral">{item.confidence} confidence</StatusBadge>
            <StatusBadge tone="info">{repairTypeLabel(item.repairType)}</StatusBadge>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">{item.area}</p>
            <h2 className="mt-1 text-lg font-semibold text-white">{item.title}</h2>
          </div>
          <p className="text-sm leading-6 text-slate-300">{item.description}</p>
        </div>

        <Link
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_40px_rgba(99,102,241,0.28)] hover:bg-indigo-400"
          href={item.actionHref || '/health-center'}
        >
          Review fix
        </Link>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/8 bg-black/10 p-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Why this matters</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">{item.whyThisMatters}</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-black/10 p-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Suggested action</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">{item.suggestedAction}</p>
        </div>
      </div>

      {item.affectedObjects.length > 0 && (
        <details className="mt-3 rounded-xl border border-white/8 bg-black/10 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">
            Affected objects
          </summary>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            {item.affectedObjects.map((affectedObject, index) => (
              <li className="break-words" key={`${item.id}-${index}-${affectedObject}`}>
                {affectedObject}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  )
}

export default async function RepairCenterPage({
  searchParams,
}: RepairCenterPageProps) {
  const params = (await searchParams) || {}
  const { supabase, user } = await requireUser()
  const dataHealthReport = await getDataHealthReport(supabase, user.id)
  const healthReport = buildHealthCenterReport(dataHealthReport)
  const report = buildRepairCenterReport(healthReport)
  const filteredItems = report.items.filter(
    (item) =>
      matchesFilter(params.area, item.area) &&
      matchesFilter(params.severity, item.severity) &&
      matchesFilter(params.repairType, item.repairType) &&
      matchesFilter(params.status, item.status)
  )

  return (
    <AppShell
      header={{
        eyebrow: 'Repair Center',
        title: 'Financial Repair Center',
        subtitle:
          'Guided workspace for reviewing Health Center findings and approving explicit repairs or metadata updates.',
        statusBadge: (
          <StatusBadge tone={toneForScore(report.overallScore)}>
            {report.overallScore}/100
          </StatusBadge>
        ),
      }}
    >
      <section className="grid gap-3 md:grid-cols-4">
        <KpiCard
          label="Critical"
          value={report.queue.critical}
          helper="Needs review before high-confidence recommendations."
        />
        <KpiCard
          label="Warnings"
          value={report.queue.warnings}
          helper="Metadata, sync, or data-quality work."
        />
        <KpiCard
          label="Information"
          value={report.queue.information}
          helper="Unknown or informational checks."
        />
        <KpiCard
          label="Completed today"
          value={report.queue.completedToday}
          helper="Healthy checks from the latest scan."
        />
      </section>

      <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/8 p-4 text-sm leading-6 text-emerald-50">
        Repairs are never automatic. Open a finding, review the evidence, make the
        approved change in the linked workflow, and Health Center will recalculate on
        the next page load.
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        {report.sections.map((section) => (
          <SectionSummary
            criticalCount={section.criticalCount}
            findingCount={section.findingCount}
            healthScore={section.healthScore}
            key={section.id}
            progress={section.progress}
            title={section.title}
            warningCount={section.warningCount}
          />
        ))}
      </section>

      <FilterBar
        area={params.area}
        repairType={params.repairType}
        severity={params.severity}
        status={params.status}
      />

      <section className="grid gap-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Repair Queue</h2>
            <p className="text-sm text-slate-400">
              {filteredItems.length} items shown from {report.items.length} total checks.
            </p>
          </div>
          <Link
            className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-sm font-semibold text-white hover:bg-white/12"
            href="/health-center"
          >
            Open Health Center
          </Link>
        </div>

        {filteredItems.map((item) => (
          <RepairItemCard item={item} key={item.id} />
        ))}

        {filteredItems.length === 0 && (
          <div className="rounded-2xl border border-white/8 bg-white/[0.045] p-6 text-sm text-slate-300">
            No repair items match the selected filters.
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Health History</h2>
            <p className="text-sm text-slate-400">
              This phase shows scan-derived completion. Persistent repair audit
              history requires a future approved data model.
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Generated {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {report.history.map((bucket) => (
            <article
              className="rounded-xl border border-white/8 bg-black/10 p-4"
              key={bucket.label}
            >
              <h3 className="font-semibold text-white">{bucket.label}</h3>
              <p className="mt-1 text-sm text-slate-400">
                {bucket.items.length} completed checks
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {bucket.items.slice(0, 4).map((item) => (
                  <li key={`${bucket.label}-${item.id}`}>{item.title}</li>
                ))}
                {bucket.items.length === 0 && (
                  <li className="text-slate-500">No completed repair events recorded.</li>
                )}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  )
}
