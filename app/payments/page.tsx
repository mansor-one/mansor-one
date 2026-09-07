import { requireUser } from '@/lib/auth/requireUser'
import { buildObligationConfigurationReport } from '@/lib/financial-engine/obligation-configuration'
import AppShell from '../components/AppShell'
import { KpiCard } from '../components/ui-primitives'
import NeedsConfiguration from './NeedsConfiguration'

export const dynamic = 'force-dynamic'

export default async function PaymentsPage() {
  const { supabase, user } = await requireUser()
  const { data: membership, error: membershipError } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membership?.household_id) throw new Error('Active household membership is required.')

  const [obligationsResult, schedulesResult, planningResult, instancesResult] = await Promise.all([
    supabase
      .from('obligations')
      .select('id, name, household_id, default_amount, amount, due_day, due_date, owner, frequency, recurrence, payment_method, is_active, notes')
      .eq('household_id', membership.household_id)
      .eq('is_active', true),
    supabase
      .from('scheduled_payments')
      .select('id, name, household_id, amount, due_day, owner, recurrence_type, recurrence_interval, is_active, notes, custom_schedule_notes')
      .eq('household_id', membership.household_id)
      .eq('is_active', true)
      .order('due_day', { ascending: true }),
    supabase
      .from('planning_items')
      .select('id, name, household_id, target_amount, due_date, is_archived')
      .eq('household_id', membership.household_id),
    supabase
      .from('obligation_instances')
      .select('obligation_id, status, expected_date')
      .eq('household_id', membership.household_id),
  ])
  if (obligationsResult.error) throw obligationsResult.error
  if (schedulesResult.error) throw schedulesResult.error
  if (planningResult.error) throw planningResult.error
  if (instancesResult.error) throw instancesResult.error

  const report = buildObligationConfigurationReport({
    obligations: obligationsResult.data || [],
    scheduledPayments: schedulesResult.data || [],
    planningItems: planningResult.data || [],
    obligationInstances: instancesResult.data || [],
  })
  const totalMonthly = (schedulesResult.data || [])
    .filter((payment) => payment.recurrence_type === 'monthly')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

  return (
    <AppShell header={{ eyebrow: 'Calendario contractual', title: 'Pagos programados', subtitle: 'Revisa datos maestros y completa obligaciones sin generar pagos ni transacciones automáticamente.' }}>
      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Obligaciones evaluadas" value={report.all.length} helper="Canónicas y calendarios legacy activos." />
        <KpiCard label="Needs Configuration" value={report.needsConfiguration.length} helper="Requieren confirmación del usuario." />
        <KpiCard label="Total mensual legacy" value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalMonthly)} helper="No crea movimientos financieros." />
      </section>

      <NeedsConfiguration items={report.needsConfiguration} />

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Calendarios activos</h2>
          <p className="text-sm text-slate-400">Vista de referencia; los importes continúan siendo datos maestros, no transacciones.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {(schedulesResult.data || []).map((payment) => (
            <article className="rounded-2xl border border-white/8 bg-white/[0.045] p-4" key={payment.id}>
              <h3 className="font-semibold text-white">{payment.name}</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-300">
                <p>Monto: ${Number(payment.amount || 0).toLocaleString()}</p>
                <p>Día: {payment.due_day || 'No configurado'}</p>
                <p>Responsable: {payment.owner || 'No configurado'}</p>
                <p>Recurrencia: {payment.recurrence_type || 'No configurada'}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  )
}
