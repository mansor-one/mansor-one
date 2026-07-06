import { requireUser } from '@/lib/auth/requireUser'
import { getRobototinaContext } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Robototina | Mansor One',
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fallback(value: string | null | undefined, label = 'N/A') {
  return value || label
}

function toneClass(tone: string) {
  if (tone === 'critical') return 'border-red-300 bg-red-50'
  if (tone === 'warning') return 'border-amber-300 bg-amber-50'
  if (tone === 'success') return 'border-emerald-300 bg-emerald-50'
  return 'border-slate-200 bg-white'
}

function confidenceLabel(level: string) {
  if (level === 'high') return 'Alta'
  if (level === 'medium') return 'Media'
  return 'Baja'
}

export default async function RobototinaPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const context = await getRobototinaContext(supabase, user.id)

  return (
    <main className="p-8 space-y-6">
      <section className="border rounded p-4 space-y-2">
        <h1 className="text-4xl font-bold">Robototina</h1>
        <p>
          Buenos dias. Interpreto el contrato oficial del Financial Engine para
          ayudarte a decidir, sin recalcular tu dinero en la pantalla.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Disponible hoy</h2>
          <p className="text-3xl font-bold">
            ${money(context.liquidity.availableCash)}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Pagos abiertos</h2>
          <p className="text-3xl font-bold">
            ${money(context.liquidity.openPaymentsTotal)}
          </p>
          <p className="text-sm opacity-70">
            {context.liquidity.openPaymentsCount} compromisos abiertos
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Ingresos esperados</h2>
          <p className="text-3xl font-bold">
            ${money(context.liquidity.projectedIncomeTotal)}
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Net worth</h2>
          <p className="text-3xl font-bold">
            ${money(context.portfolio.netWorth)}
          </p>
        </div>
      </section>

      <section className="border rounded p-4 space-y-4">
        <h2 className="text-2xl font-bold">Recomendaciones</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {context.advisorRecommendations.map((recommendation) => (
            <article
              key={recommendation.id}
              className={`border rounded p-4 space-y-3 ${toneClass(
                recommendation.tone
              )}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide opacity-70">
                    {recommendation.recommendation}
                  </p>
                  <h3 className="text-xl font-semibold">
                    {recommendation.reason}
                  </h3>
                </div>
                <span className="border rounded px-2 py-1 text-sm font-semibold bg-white">
                  Confianza {confidenceLabel(recommendation.confidenceLevel)}
                </span>
              </div>

              <ul className="list-disc pl-5 space-y-1">
                {recommendation.supportingFacts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>

              {recommendation.href && (
                <a
                  className="inline-flex text-sm font-semibold underline"
                  href={recommendation.href}
                >
                  Ver accion
                </a>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="border rounded p-4 space-y-4">
        <h2 className="text-2xl font-bold">Lectura de Robototina</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {context.insights.map((insight) => (
            <article
              key={insight.id}
              className={`border rounded p-4 space-y-2 ${toneClass(insight.tone)}`}
            >
              <h3 className="text-xl font-semibold">{insight.title}</h3>
              <p>{insight.message}</p>
              {insight.href && (
                <a
                  className="inline-flex text-sm font-semibold underline"
                  href={insight.href}
                >
                  Ver detalle
                </a>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="border rounded p-4 space-y-4">
        <h2 className="text-2xl font-bold">Proyeccion</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded p-3">
            <h3 className="font-semibold">Inicial</h3>
            <p className="text-2xl font-bold">
              ${money(context.timeline.startingCash)}
            </p>
            <p className="text-sm opacity-70">
              Cash usable del Financial Engine.
            </p>
          </div>

          <div className="border rounded p-3">
            <h3 className="font-semibold">Punto mas bajo</h3>
            <p className="text-2xl font-bold">
              ${money(context.timeline.lowestPointBalance)}
            </p>
            <p className="text-sm opacity-70">
              {fallback(context.timeline.lowestPointDate, 'Sin fecha')}
            </p>
          </div>

          <div className="border rounded p-3">
            <h3 className="font-semibold">Final proyectado</h3>
            <p className="text-2xl font-bold">
              ${money(context.timeline.finalBalance)}
            </p>
            <p className="text-sm opacity-70">
              Asume compromisos abiertos e ingresos esperados cargados.
            </p>
          </div>
        </div>

        {context.timeline.lowestPointPayments.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-semibold">Pagos que explican el punto bajo</h3>
            {context.timeline.lowestPointPayments.map((payment) => (
              <div key={payment.id} className="border rounded p-3">
                <p className="font-semibold">
                  {fallback(payment.name, 'Pago sin nombre')}
                </p>
                <p>Monto: ${money(payment.amount)}</p>
                <p>
                  Fecha:{' '}
                  {fallback(payment.effective_due_date, 'Sin fecha')}
                </p>
                {payment.isInGracePeriod && (
                  <p className="text-sm font-semibold">
                    Dentro de periodo de gracia
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded p-4 space-y-3">
          <h2 className="text-2xl font-bold">Pagos abiertos</h2>
          {context.liquidity.openPayments.slice(0, 5).map((payment) => (
            <div key={payment.id} className="border rounded p-3">
              <h3 className="font-semibold">
                {fallback(payment.name, 'Pago sin nombre')}
              </h3>
              <p>Monto: ${money(payment.amount)}</p>
              <p>
                Fecha:{' '}
                {fallback(
                  payment.effective_due_date || payment.due_date,
                  'Sin fecha'
                )}
              </p>
              <p>Estado: {fallback(payment.lifecycleLabel || payment.status)}</p>
              {payment.isInGracePeriod && (
                <p>
                  Gracia hasta:{' '}
                  {fallback(
                    payment.grace_until || payment.grace_due_date,
                    'fecha configurada'
                  )}
                </p>
              )}
            </div>
          ))}

          {context.liquidity.openPayments.length === 0 && (
            <p className="opacity-70">No hay pagos abiertos.</p>
          )}
        </div>

        <div className="border rounded p-4 space-y-3">
          <h2 className="text-2xl font-bold">Ingresos esperados</h2>
          {context.liquidity.projectedIncome.slice(0, 5).map((income) => (
            <div key={income.id || income.name} className="border rounded p-3">
              <h3 className="font-semibold">
                {fallback(income.name, 'Ingreso sin nombre')}
              </h3>
              <p>Monto: ${money(income.amount)}</p>
              <p>
                Fecha:{' '}
                {fallback(income.next_expected_date, 'Sin fecha')}
              </p>
              <p>Estado: {fallback(income.status, 'expected')}</p>
            </div>
          ))}

          {context.liquidity.projectedIncome.length === 0 && (
            <p className="opacity-70">No hay ingresos esperados proyectados.</p>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Planning/Funds</h2>
          <p className="text-3xl font-bold">{context.planning.fundsCount}</p>
          <p className="text-sm opacity-70">
            ${money(context.planning.totalTargetAmount)} en metas activas
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Review Queue</h2>
          <p className="text-3xl font-bold">
            {context.reviewQueue.pendingCount}
          </p>
          <p className="text-sm opacity-70">
            {context.reviewQueue.possibleDuplicateCount} posibles duplicados ·{' '}
            {context.reviewQueue.needsCategoryCount} categorias
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Estado del motor</h2>
          <p className="text-3xl font-bold">
            {context.decision.overallFinancialState}
          </p>
          <p className="text-sm opacity-70">
            {context.decision.decisionCount} decisiones interpretables
          </p>
        </div>
      </section>

      {context.liquidity.staleAccountWarnings.length > 0 && (
        <section className="border rounded p-4 space-y-3">
          <h2 className="text-2xl font-bold">Balances a revisar</h2>
          {context.liquidity.staleAccountWarnings.map((warning) => (
            <div key={warning.id} className="border rounded p-3">
              <p className="font-semibold">{warning.label}</p>
              <p>
                Ultimo update:{' '}
                {fallback(warning.lastUpdatedAt, 'Sin fecha de sync')}
              </p>
              {warning.ageHours !== null && (
                <p className="text-sm opacity-70">
                  Hace aproximadamente {warning.ageHours} horas.
                </p>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  )
}
