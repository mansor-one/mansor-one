import type { Metadata } from 'next'
import AppShell from '@/app/components/AppShell'
import { requireUser } from '@/lib/auth/requireUser'
import { getObligationLifecyclePaymentItems } from '@/lib/finance/paymentLifecycle'
import {
  buildMonthlyReport,
  getPortfolioSummary,
  getReviewQueue,
  getRobototinaContext,
  parseReportMonth,
  type MonthlyObligationRow,
} from '@/lib/financial-engine'
import ReportActions from './ReportActions'

export const metadata: Metadata = { title: 'Reportes mensuales | Mansor One' }

type SearchParams = Promise<{ month?: string | string[] }>
function money(value: number | null) {
  if (value === null) return 'No disponible'
  return new Intl.NumberFormat('es-PR', { style: 'currency', currency: 'USD' }).format(value)
}

function Card({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return <div className="rounded-xl border border-white/8 bg-white/[0.035] p-4"><p className="text-xs uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p>{helper && <p className="mt-1 text-xs text-slate-400">{helper}</p>}</div>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="report-section break-inside-avoid rounded-2xl border border-white/8 bg-[#0b1220]/80 p-5"><h2 className="text-lg font-bold">{title}</h2><div className="mt-4">{children}</div></section>
}

function ScopeHeader({ title, description, tone }: { title: string; description: string; tone: 'historical' | 'snapshot' | 'operational' }) {
  const tones = {
    historical: 'border-sky-400/25 bg-sky-400/8 text-sky-100',
    snapshot: 'border-violet-400/25 bg-violet-400/8 text-violet-100',
    operational: 'border-amber-400/25 bg-amber-400/8 text-amber-100',
  }
  return <div className={`report-scope rounded-xl border p-4 ${tones[tone]}`}><p className="text-xs font-bold uppercase tracking-[0.16em]">{title}</p><p className="mt-1 text-sm opacity-80">{description}</p></div>
}

function SourceBadge({ source, connected }: { source: 'plaid' | 'manual'; connected: boolean }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${source === 'plaid' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-slate-400/20 bg-slate-400/10 text-slate-300'}`}>{source === 'plaid' ? connected ? 'Plaid · conectada' : 'Plaid' : 'Manual / legacy'}</span>
}

function Empty({ children = 'Sin datos para este período.' }: { children?: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-400">{children}</p>
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const requested = Array.isArray(params.month) ? params.month[0] : params.month
  const period = parseReportMonth(requested)
  const { supabase, user } = await requireUser()
  const [portfolio, reviewQueue, robototina, lifecycleObligations] = await Promise.all([
    getPortfolioSummary(supabase, user.id),
    getReviewQueue(supabase, user.id),
    getRobototinaContext(supabase, user.id),
    getObligationLifecyclePaymentItems(supabase, user.id, {
      today: period.startDate,
      horizonEnd: period.endDate,
    }),
  ])
  const obligations: MonthlyObligationRow[] = lifecycleObligations
    .filter((row) => {
      const dueDate = row.effective_due_date || row.expected_date || row.due_date || ''
      const isHistoricalProjection = !period.isOpen && row.id.startsWith('projected:')
      return !isHistoricalProjection && dueDate >= period.startDate && dueDate <= period.endDate
    })
    .map((row) => ({
      id: row.id,
      name: row.name || 'Obligación',
      amount: Number(row.amount || 0),
      dueDate: row.effective_due_date || row.expected_date || row.due_date || period.startDate,
      status: row.status || 'pending',
    }))
  const report = buildMonthlyReport({
    month: period.month,
    transactions: reviewQueue.source.ledgerSummary.confirmedLedgerEntries,
    obligations,
    portfolio,
    pendingReviewCount: reviewQueue.statistics.totalCandidates,
    robototinaInsights: robototina.insights,
  })
  const obligationGroups = [
    ['Pagadas', report.obligations.paid], ['Pendientes', report.obligations.pending],
    ['Vencidas', report.obligations.overdue], ['Próximas', report.obligations.upcoming],
  ] as const
  const snapshotLabel = report.period.isOpen ? 'Valor actual' : 'Valor actual — no histórico'
  const visibleAccounts = report.bankAccounts.filter((account) => account.closingBalance !== 0 || account.hasActivity)
  const inactiveZeroAccounts = report.bankAccounts.filter((account) => account.closingBalance === 0 && !account.hasActivity)

  return (
    <AppShell header={{ eyebrow: 'Reporte mensual', title: `Mansor One — ${report.period.label}`, subtitle: 'Vista consolidada del ledger confirmado, obligaciones, cuentas, deuda y contexto financiero.', secondaryAction: <ReportActions month={report.period.month} /> }}>
      <div className="monthly-report space-y-5" data-report-month={report.period.month}>
        <div className="no-print rounded-xl border border-amber-400/20 bg-amber-400/8 p-3 text-sm text-amber-100">{report.disclosures[0]}</div>

        <ScopeHeader title="Datos históricos del mes" description={`Movimientos confirmados y obligaciones correspondientes a ${report.period.label}.`} tone="historical" />

        <Section title="Resumen del mes">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Card label="Ingresos del mes" value={money(report.summary.income)} />
            <Card label="Gastos confirmados" value={money(report.summary.confirmedExpenses)} />
            <Card label="Pagos realizados" value={money(report.summary.payments)} />
          </div>
        </Section>

        <div className="grid gap-5 xl:grid-cols-2">
          <Section title="Flujo de efectivo"><div className="grid gap-3 sm:grid-cols-2"><Card label="Ingresos" value={money(report.cashFlow.income)} /><Card label="Gastos" value={money(report.cashFlow.expenses)} /><Card label="Transferencias" value={money(report.cashFlow.transfers)} /><Card label="Pagos de deuda" value={money(report.cashFlow.debtPayments)} /></div><p className="mt-4 flex justify-between border-t border-white/8 pt-3 font-semibold"><span>Flujo neto</span><span>{money(report.cashFlow.net)}</span></p></Section>
          <Section title="Gastos por categoría">{report.categories.length ? <div className="space-y-3">{report.categories.map((row) => <div className="grid grid-cols-[1fr_auto] gap-3" key={row.code}><div><p className="font-medium">{row.label}</p><div className="mt-1 h-1.5 rounded-full bg-white/8"><div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.max(3, (row.amount / Math.max(report.summary.confirmedExpenses, 1)) * 100)}%` }} /></div><p className="mt-1 text-xs text-slate-400">{row.count} movimiento(s)</p></div><strong>{money(row.amount)}</strong></div>)}</div> : <Empty />}</Section>
        </div>

        <Section title="Obligaciones"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{obligationGroups.map(([label, rows]) => <div key={label}><div className="flex items-center justify-between"><h3 className="font-semibold">{label}</h3><span className="rounded-full bg-white/8 px-2 py-0.5 text-xs">{rows.length}</span></div><div className="mt-2 space-y-2">{rows.length ? rows.map((row) => <div className="rounded-lg border border-white/8 p-3 text-sm" key={row.id}><p className="font-medium">{row.name}</p><p className="mt-1 text-slate-400">{row.dueDate} · {money(row.amount)}</p></div>) : <p className="text-sm text-slate-500">Ninguna</p>}</div></div>)}</div></Section>

        <Section title="Movimientos relevantes">{report.relevantMovements.length ? <div className="space-y-2">{report.relevantMovements.map((row) => <div className="flex justify-between gap-4 rounded-lg border border-white/8 p-3 text-sm" key={`${row.kind}:${row.id}`}><div><p className="font-medium">{row.description}</p><p className="text-xs text-slate-400">{row.label} · {row.date}</p></div><strong>{money(row.amount)}</strong></div>)}</div> : <Empty />}</Section>

        <Section title="Notas de Robototina sobre el mes"><ol className="grid gap-3 [counter-reset:report-note]">{report.robototinaNotes.map((note, index) => <li className="grid grid-cols-[2rem_1fr] items-start gap-3 rounded-lg border border-white/8 p-3 text-sm leading-6" key={`${index}:${note}`}><span className="grid h-8 w-8 place-items-center rounded-full bg-violet-500/20 text-sm font-bold tabular-nums text-violet-200">{String(index + 1).padStart(2, '0')}</span><span className="pt-1">{note}</span></li>)}</ol></Section>

        <ScopeHeader title="Snapshot financiero actual" description={`Balances y patrimonio consultados ahora. ${snapshotLabel}.`} tone="snapshot" />

        <Section title="Posición financiera actual"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Card label="Disponible actual" value={money(report.summary.availableAtClose)} helper={snapshotLabel} /><Card label="Deuda total actual" value={money(report.summary.totalDebt)} helper={snapshotLabel} /><Card label="Net worth actual" value={money(report.summary.netWorth)} helper={snapshotLabel} /></div></Section>

        <Section title="Tarjetas y préstamos — valores actuales">{report.debt.length ? <div><div className="grid gap-3 md:hidden">{report.debt.map((row) => <article className="rounded-xl border border-white/8 p-4" key={row.id}><div className="flex items-start justify-between gap-3"><div><strong>{row.name}</strong><span className="mb-2 block text-xs text-slate-400">{row.institution}</span><SourceBadge connected={row.isConnected} source={row.source} /></div><div className="text-right"><strong>{money(row.closingBalance)}</strong><span className="block text-[11px] text-violet-200">{snapshotLabel}</span></div></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-400">Balance inicial</dt><dd className="mt-1 font-semibold">{money(row.openingBalance)}</dd></div><div><dt className="text-xs text-slate-400">Pagos del mes</dt><dd className="mt-1 font-semibold">{money(row.payments)}</dd></div></dl></article>)}</div><div className="hidden md:block"><table className="w-full text-left text-sm"><thead className="text-slate-400"><tr><th className="pb-3">Cuenta y fuente</th><th className="pb-3">Balance inicial</th><th className="pb-3">Pagos del mes</th><th className="pb-3 text-right">Balance actual</th></tr></thead><tbody>{report.debt.map((row) => <tr className="border-t border-white/8" key={row.id}><td className="py-3"><strong>{row.name}</strong><span className="mb-1 block text-xs text-slate-400">{row.institution}</span><SourceBadge connected={row.isConnected} source={row.source} /></td><td>{money(row.openingBalance)}</td><td>{money(row.payments)}</td><td className="text-right"><strong>{money(row.closingBalance)}</strong><span className="block text-[11px] text-violet-200">{snapshotLabel}</span></td></tr>)}</tbody></table></div><p className="mt-3 text-xs text-slate-400">Las filas Plaid y manual/legacy permanecen separadas; no se consolidan sin evidencia inequívoca.</p></div> : <Empty />}</Section>

        <Section title="Cuentas bancarias — balances actuales">{visibleAccounts.length ? <div className="grid gap-3 md:grid-cols-2">{visibleAccounts.map((row) => <div className="flex items-center justify-between gap-4 rounded-lg border border-white/8 p-3" key={row.id}><div><p className="font-medium">{row.name}</p><p className="mb-1 text-xs text-slate-400">{row.institution}</p><SourceBadge connected={row.isConnected} source={row.source} /></div><div className="text-right"><strong>{money(row.closingBalance)}</strong><span className="block text-[11px] text-violet-200">{snapshotLabel}</span></div></div>)}</div> : <Empty>No hay cuentas con balance o actividad durante el mes.</Empty>}{inactiveZeroAccounts.length > 0 && <details className="no-print mt-4 rounded-lg border border-white/8 p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-300">Mostrar {inactiveZeroAccounts.length} cuenta(s) con balance $0 y sin actividad del mes</summary><div className="mt-3 grid gap-3 md:grid-cols-2">{inactiveZeroAccounts.map((row) => <div className="flex items-center justify-between rounded-lg border border-white/8 p-3 text-sm" key={row.id}><div><p className="font-medium">{row.name}</p><p className="text-xs text-slate-400">{row.institution} · {row.source === 'plaid' ? 'Plaid' : 'Manual / legacy'}</p></div><strong>{money(row.closingBalance)}</strong></div>)}</div></details>}</Section>

        <ScopeHeader title="Estado operativo actual de Mansor One" description="Calidad de datos y observaciones operativas consultadas ahora; no forman parte del cierre histórico del mes." tone="operational" />

        <div className="grid gap-5 xl:grid-cols-2"><Section title="Estado actual de calidad de datos"><ul className="space-y-2">{report.dataQualityNotes.map((note) => <li className="rounded-lg border border-amber-400/15 bg-amber-400/5 p-3 text-sm" key={note}>{note}</li>)}</ul></Section><Section title="Observaciones actuales de Robototina">{report.currentRobototinaNotes.length ? <ol className="space-y-3">{report.currentRobototinaNotes.map((note, index) => <li className="grid grid-cols-[2rem_1fr] gap-3 text-sm leading-6" key={`${index}:${note}`}><span className="font-bold tabular-nums text-amber-200">{String(index + 1).padStart(2, '0')}.</span><span>{note}</span></li>)}</ol> : <Empty>Sin observaciones operativas actuales.</Empty>}</Section></div>

        <footer className="report-disclosures border-t border-white/8 pt-4 text-xs text-slate-500"><p className="font-semibold text-slate-400">Notas de alcance</p><ul className="mt-2 list-disc space-y-1 pl-5">{report.disclosures.map((item) => <li key={item}>{item}</li>)}</ul></footer>
      </div>
    </AppShell>
  )
}
