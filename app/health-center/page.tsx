import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import {
  buildHealthCenterReport,
  getDataHealthReport,
  type HealthCenterActionType,
  type HealthCenterFinding,
  type HealthCenterReadinessGate,
  type HealthCenterSection,
} from '@/lib/financial-engine'
import AppShell from '../components/AppShell'
import { KpiCard, StatusBadge } from '../components/ui-primitives'

export const dynamic = 'force-dynamic'

function toneForScore(score: number): 'success' | 'warning' | 'critical' {
  if (score >= 85) return 'success'
  if (score >= 65) return 'warning'
  return 'critical'
}

function severityTone(
  severity: HealthCenterFinding['severity']
): 'success' | 'warning' | 'critical' | 'neutral' {
  if (severity === 'critical') return 'critical'
  if (severity === 'warning' || severity === 'unknown') return 'warning'
  return 'success'
}

function actionLabel(actionType: HealthCenterActionType) {
  if (actionType === 'automatic_repairable') return 'Repair candidate'
  if (actionType === 'requires_user_input') return 'Needs confirmation'
  if (actionType === 'requires_external_sync') return 'Needs sync'
  return 'Informational'
}

function actionTone(
  actionType: HealthCenterActionType
): 'success' | 'warning' | 'info' | 'neutral' {
  if (actionType === 'automatic_repairable') return 'info'
  if (actionType === 'requires_user_input') return 'warning'
  if (actionType === 'requires_external_sync') return 'warning'
  return 'neutral'
}

function FindingCard({ finding }: { finding: HealthCenterFinding }) {
  return (
    <article className="rounded-2xl border border-white/8 bg-white/[0.045] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={severityTone(finding.severity)}>
              {finding.severity}
            </StatusBadge>
            <StatusBadge tone={actionTone(finding.actionType)}>
              {actionLabel(finding.actionType)}
            </StatusBadge>
            <StatusBadge tone="neutral">{finding.confidence} confidence</StatusBadge>
          </div>
          <h3 className="text-base font-semibold text-white">{finding.title}</h3>
          <p className="text-sm leading-6 text-slate-300">{finding.explanation}</p>
          <p className="text-sm font-medium text-slate-200">
            Recommended action: {finding.recommendedAction}
          </p>
        </div>

        {finding.actionHref && (
          <Link
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-sm font-semibold text-white hover:bg-white/12"
            href={finding.actionHref}
          >
            Review
          </Link>
        )}
      </div>

      {finding.affectedObjects.length > 0 && (
        <details className="mt-3 rounded-xl border border-white/8 bg-black/10 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">
            Affected data
          </summary>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            {finding.affectedObjects.map((item, index) => (
              <li className="break-words" key={`${finding.id}-${index}-${item}`}>
                {item}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  )
}

function SectionPanel({ section }: { section: HealthCenterSection }) {
  const actionable = section.findings.filter((finding) => finding.severity !== 'healthy')

  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{section.title}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {section.issueCount} issues · {section.criticalCount} critical ·{' '}
            {section.warningCount} warnings · {section.infoCount} healthy checks
          </p>
        </div>
        <StatusBadge tone={toneForScore(section.score)}>
          {section.score}/100
        </StatusBadge>
      </div>

      <div className="mt-4 grid gap-3">
        {actionable.slice(0, 4).map((finding) => (
          <FindingCard finding={finding} key={finding.id} />
        ))}

        {actionable.length === 0 && (
          <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/8 p-4 text-sm text-emerald-100">
            No action needed in this area.
          </div>
        )}
      </div>
    </section>
  )
}

function ReadinessCard({ gate }: { gate: HealthCenterReadinessGate }) {
  return (
    <article className="rounded-2xl border border-white/8 bg-white/[0.045] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">{gate.title}</h3>
          <p className="mt-1 text-sm text-slate-400">
            {gate.blockers.length} blockers
          </p>
        </div>
        <StatusBadge tone={toneForScore(gate.score)}>{gate.score}/100</StatusBadge>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Blockers</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {(gate.blockers.length > 0 ? gate.blockers : ['No active blockers in this gate.']).map(
              (item) => (
                <li key={item}>{item}</li>
              )
            )}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Next steps</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {gate.nextSteps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  )
}

export default async function HealthCenterPage() {
  const { supabase, user } = await requireUser()
  const dataHealthReport = await getDataHealthReport(supabase, user.id)
  const report = buildHealthCenterReport(dataHealthReport)

  return (
    <AppShell
      header={{
        eyebrow: 'Health Center',
        title: 'Financial Health Center',
        subtitle:
          'Live integrity scan for cards, income, Plaid, transfers, planning, Snapshot readiness and Robototina confidence.',
        statusBadge: (
          <StatusBadge tone={toneForScore(report.overallScore)}>
            {report.overallScore}/100
          </StatusBadge>
        ),
      }}
    >
      <section className="grid gap-3 md:grid-cols-4">
        <KpiCard
          label="Financial health"
          value={`${report.overallScore}/100`}
          helper={report.summary}
        />
        <KpiCard
          label="Critical findings"
          value={report.criticalFindings.length}
          helper="Items that can distort decisions."
        />
        <KpiCard
          label="Auto-repair candidates"
          value={report.autoRepairableItems.length}
          helper="Reviewable repair candidates only."
        />
        <KpiCard
          label="User action needed"
          value={report.userActionRequired.length}
          helper="Metadata or confirmations needed."
        />
      </section>

      <section className="rounded-2xl border border-indigo-300/15 bg-indigo-400/8 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-white">Ready to review repairs</h2>
            <p className="mt-1 text-sm text-slate-300">
              Open the Repair Center to review findings, understand impact, and approve
              the next safe action. Nothing is repaired automatically.
            </p>
          </div>
          <Link
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
            href="/repair-center"
          >
            Open Repair Center
          </Link>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {report.readinessGates.map((gate) => (
          <ReadinessCard gate={gate} key={gate.id} />
        ))}
      </section>

      <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Repair Backlog</h2>
            <p className="text-sm text-slate-400">
              Grouped by financial area. No repairs are applied automatically.
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Generated {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-white/8">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-white/[0.06] text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Impact</th>
                <th className="px-4 py-3">Repair type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {report.repairBacklog.slice(0, 12).map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-slate-300">{item.group}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      tone={item.priority === 'critical' ? 'critical' : 'warning'}
                    >
                      {item.priority}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-white">{item.title}</td>
                  <td className="px-4 py-3 text-slate-300">{item.estimatedImpact}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {actionLabel(item.autoFixPotential)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4">
        {report.sections.map((section) => (
          <SectionPanel key={section.id} section={section} />
        ))}
      </div>
    </AppShell>
  )
}
