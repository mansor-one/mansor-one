import { FinancialDecisionContext, AttentionItem } from './getFinancialDecisionContext'

const STATUS_PRIORITY: Record<string, number> = {
  overdue: 1,
  in_grace: 2,
  due_today: 3,
  due_soon: 4,
  normal: 5,
}

const ATTENTION_NAMES = new Set([
  'colegio gaby',
  'agua',
  'honda soraya',
  'toyota corolla cross',
  'synchrony',
  'luz',
])

export function buildRecommendation(context: FinancialDecisionContext) {
  const headline =
    context.cashAvailable < context.totalObligationsThisPeriod
      ? 'No hay efectivo suficiente hoy para cubrir todos los compromisos.'
      : 'El efectivo disponible cubre al menos los compromisos obligatorios hoy.'

  const summary =
    context.projectedCashAfterAllObligations >= 0
      ? 'Los próximos ingresos cubren las obligaciones.'
      : 'Aun con próximos ingresos hay déficit.'

  const tomorrowSorted = [...context.attentionItems].sort((a, b) => {
    const statusA = STATUS_PRIORITY[a.status] ?? 99
    const statusB = STATUS_PRIORITY[b.status] ?? 99
    if (statusA !== statusB) return statusA - statusB
    return Number(b.amount || 0) - Number(a.amount || 0)
  })

  const priorityOrder = tomorrowSorted.map((item) => ({
    name: item.name,
    amount: Number(item.amount || 0),
    status: item.status,
    reason: ATTENTION_NAMES.has(item.name.toLowerCase())
      ? `Prioritario: ${item.name}`
      : `Estado ${item.status}`,
  }))

  const warnings: string[] = []
  if (context.creditAvailable > 0) {
    warnings.push('No recomendar usar crédito disponible como cash. Usa crédito solo para emergencias.')
  }
  if (context.cashAvailable < context.totalObligationsThisPeriod) {
    warnings.push('El efectivo hoy no cubre todos los compromisos. Prioriza pagos vencidos y en gracia.')
  }

  const nextBestAction =
    'Espera el próximo ingreso antes de hacer pagos extra. Prioriza Honda/Toyota y pagos vencidos.'

  return {
    headline,
    priorityOrder,
    summary,
    warnings,
    nextBestAction,
  }
}
