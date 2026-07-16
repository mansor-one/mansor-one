import Link from 'next/link'
import { notFound } from 'next/navigation'
import { evaluateInternalToolAccess } from '@/lib/auth/internal-tools'
import { requireUser } from '@/lib/auth/requireUser'
import {
  getDataHealthReport,
  type DataHealthCheck,
  type DataHealthStatus,
} from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const GROUPS: Array<{
  status: DataHealthStatus
  title: string
  description: string
}> = [
  {
    status: 'critical',
    title: 'Critical',
    description: 'Data that can distort financial truth or block decisions.',
  },
  {
    status: 'warning',
    title: 'Warnings',
    description: 'Data that is usable, but needs cleanup or confirmation.',
  },
  {
    status: 'unknown',
    title: 'Unknown',
    description: 'Data not verified through the current authenticated read path.',
  },
  {
    status: 'healthy',
    title: 'Healthy',
    description: 'Checks that passed through official server-side paths.',
  },
]

function statusClass(status: DataHealthStatus) {
  if (status === 'critical') return 'border-l-red-500 bg-red-50/40'
  if (status === 'warning') return 'border-l-amber-500 bg-amber-50/40'
  if (status === 'unknown') return 'border-l-slate-500 bg-slate-50'
  return 'border-l-emerald-500 bg-emerald-50/40'
}

function badgeClass(status: DataHealthStatus) {
  if (status === 'critical') return 'bg-red-100 text-red-800'
  if (status === 'warning') return 'bg-amber-100 text-amber-800'
  if (status === 'unknown') return 'bg-slate-200 text-slate-800'
  return 'bg-emerald-100 text-emerald-800'
}

function domainLabel(value: string) {
  return value.replace(/_/g, ' ')
}

function CheckCard({ check }: { check: DataHealthCheck }) {
  return (
    <article
      className={`rounded-md border border-slate-200 border-l-4 p-4 shadow-sm ${statusClass(
        check.status
      )}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(
                check.status
              )}`}
            >
              {check.status}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
              {domainLabel(check.domain)}
            </span>
            {check.affectedCount !== undefined && (
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                {check.affectedCount} affected
              </span>
            )}
          </div>

          <h3 className="text-base font-semibold text-slate-950">
            {check.title}
          </h3>
          <p className="text-sm leading-6 text-slate-700">{check.finding}</p>
          {check.requiresUserConfirmation && (
            <p className="text-xs font-medium text-slate-600">
              Needs user confirmation before repair.
            </p>
          )}
        </div>

        {check.actionHref && (
          <Link
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            href={check.actionHref}
          >
            Review
          </Link>
        )}
      </div>

      <details className="mt-4 rounded-md border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">
          Evidence
        </summary>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {check.evidence.map((item) => (
            <li className="break-words" key={item}>
              {item}
            </li>
          ))}
        </ul>
      </details>
    </article>
  )
}

export default async function DevDataHealthPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const access = evaluateInternalToolAccess({
    surface: 'dev',
    userEmail: user.email,
  })

  if (!access.allowed) {
    notFound()
  }

  const report = await getDataHealthReport(supabase, user.id)

  const grouped = new Map<DataHealthStatus, DataHealthCheck[]>(
    GROUPS.map((group) => [
      group.status,
      report.checks.filter((check) => check.status === group.status),
    ])
  )

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-md border border-slate-300 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Read-only internal tool
              </p>
              <h1 className="text-3xl font-bold">Data Health Inspector</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-700">
                Authenticated server-side validation of Mansor One financial
                data through Financial Engine helpers and read-only table
                checks. Unknown means the inspector could not verify the data
                through this access path; it does not automatically mean the
                data is missing.
              </p>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-600">Score</p>
              <p className="text-5xl font-bold">{report.score}</p>
              <p className="mt-1 text-xs text-slate-500">
                Generated {new Date(report.generatedAt).toLocaleString()}
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-md border border-red-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-600">Critical</p>
            <p className="text-3xl font-bold">{report.criticalCount}</p>
          </div>
          <div className="rounded-md border border-amber-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-600">Warnings</p>
            <p className="text-3xl font-bold">{report.warningCount}</p>
          </div>
          <div className="rounded-md border border-slate-300 bg-white p-4">
            <p className="text-sm font-medium text-slate-600">Unknown</p>
            <p className="text-3xl font-bold">{report.unknownChecks.length}</p>
          </div>
          <div className="rounded-md border border-emerald-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-600">Total checks</p>
            <p className="text-3xl font-bold">{report.checks.length}</p>
          </div>
        </section>

        <section className="rounded-md border border-slate-300 bg-white p-4">
          <h2 className="text-lg font-semibold">Access Path Meaning</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <h3 className="font-semibold">Missing data</h3>
              <p className="mt-1 text-sm text-slate-700">
                A check could read the relevant source and found no row or field
                for the expected data.
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <h3 className="font-semibold">Unknown due to access path</h3>
              <p className="mt-1 text-sm text-slate-700">
                A source could not be verified from the authenticated read path.
                The data may exist, but this inspector will not assume it.
              </p>
            </div>
          </div>
        </section>

        {GROUPS.map((group) => {
          const checks = grouped.get(group.status) || []

          return (
            <section className="space-y-3" key={group.status}>
              <div>
                <h2 className="text-xl font-bold">{group.title}</h2>
                <p className="text-sm text-slate-600">{group.description}</p>
              </div>

              <div className="grid gap-3">
                {checks.map((item) => (
                  <CheckCard check={item} key={item.id} />
                ))}

                {checks.length === 0 && (
                  <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
                    No {group.title.toLowerCase()} checks.
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
