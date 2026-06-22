import { FinancialDecisionContext } from './getFinancialDecisionContext'
import { buildRecommendation } from './buildRecommendation'

function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

type AnswerItem = {
  name: string
  amount: number
  status: string
}

function findAttentionItem(context: FinancialDecisionContext, keyword: string): AnswerItem | null {
  const key = keyword.toLowerCase()
  const attention = context.attentionItems.find((it) =>
    it.name.toLowerCase().includes(key)
  )
  if (attention) {
    return { name: attention.name, amount: Number(attention.amount || 0), status: attention.status }
  }

  const liability = context.unpaidCriticalLiabilities.find((liability) =>
    String(liability.name || '').toLowerCase().includes(key)
  )
  if (liability) {
    return {
      name: liability.name,
      amount: Number(liability.monthly_payment || 0),
      status: liability.status,
    }
  }

  return null
}

function findPaymentInstance(context: FinancialDecisionContext, keyword: string): AnswerItem | null {
  const key = keyword.toLowerCase()
  const payment = context.pendingPaymentInstances.find((p) =>
    String(p.name || '').toLowerCase().includes(key)
  )
  if (payment) {
    return { name: payment.name, amount: Number(payment.amount || 0), status: payment.status }
  }
  return null
}

export function answerQuestion(question: string, context: FinancialDecisionContext): string {
  const q = question.toLowerCase().trim()
  const rec = buildRecommendation(context)

  const cashAvailable = context.cashAvailable ?? 0
  const projectedAll = context.projectedCashAfterAllObligations ?? 0
  const totalObligations = context.totalObligationsThisPeriod ?? 0

  // Check if asking about payment "after payday/income"
  const isAfterIncome = q.includes('después de') || q.includes('cuando cobre') || q.includes('próximo ingreso')

  // Specific liability payments: Honda, Toyota, Synchrony, Agua, Colegio
  const specificLiabilities = ['honda', 'toyota', 'synchrony', 'agua', 'colegio', 'luz']
  for (const liability of specificLiabilities) {
    if (q.includes(`pagar ${liability}`) || q.includes(`pago de ${liability}`)) {
      const item = findAttentionItem(context, liability) || findPaymentInstance(context, liability)
      const amount = item ? Number(item.amount || 0) : 0

      if (!item || amount <= 0) {
        return `No encontré el pago de ${liability} en el contexto actual.`
      }

      if (cashAvailable >= amount) {
        return `Sí. Tienes ${formatMoney(cashAvailable)} disponible y ${liability} requiere ${formatMoney(amount)}. Puedes pagar ${liability} hoy si no afecta otras obligaciones críticas. ${rec.nextBestAction}`
      }

      const missing = amount - cashAvailable
      const futureCover = projectedAll >= 0
      return `No con el efectivo disponible hoy. Tienes ${formatMoney(cashAvailable)} y ${liability} requiere ${formatMoney(amount)}. Te faltarían ${formatMoney(missing)}.${futureCover ? ' Con los próximos ingresos sí podrías cubrirlo, pero no hagas pagos extra antes.' : ' Con los próximos ingresos aún puede haber un déficit, así que evita pagos extra.'}`
    }
  }

  // "¿Puedo pagar Honda hoy?" format
  if (q.includes('honda') && (q.includes('puedo') || q.includes('debo'))) {
    const item = findAttentionItem(context, 'honda')
    const amount = item ? Number(item.amount || 0) : 0

    if (!item || amount <= 0) {
      return 'No encontré el pago de Honda en el contexto actual.'
    }

    if (cashAvailable >= amount) {
      return `Sí. Tienes ${formatMoney(cashAvailable)} disponible y Honda requiere ${formatMoney(amount)}. Puedes pagar Honda hoy si no afecta otras obligaciones críticas. ${rec.nextBestAction}`
    }

    const missing = amount - cashAvailable
    const futureCover = projectedAll >= 0
    return `No con el efectivo disponible hoy. Tienes ${formatMoney(cashAvailable)} y Honda requiere ${formatMoney(amount)}. Te faltarían ${formatMoney(missing)}.${futureCover ? ' Con los próximos ingresos sí podrías cubrirlo, pero no hagas pagos extra antes.' : ' Con los próximos ingresos aún puede haber un déficit, así que evita pagos extra.'}`
  }

  if (q.includes('toyota') && (q.includes('puedo') || q.includes('debo'))) {
    const item = findAttentionItem(context, 'toyota')
    const amount = item ? Number(item.amount || 0) : 0

    if (!item || amount <= 0) {
      return 'No encontré el pago de Toyota en el contexto actual.'
    }

    if (cashAvailable >= amount) {
      return `Sí. Tienes ${formatMoney(cashAvailable)} disponible y Toyota requiere ${formatMoney(amount)}. Puedes pagar Toyota hoy si no afecta otras obligaciones críticas. ${rec.nextBestAction}`
    }

    const missing = amount - cashAvailable
    const futureCover = projectedAll >= 0
    return `No con el efectivo disponible hoy. Tienes ${formatMoney(cashAvailable)} y Toyota requiere ${formatMoney(amount)}. Te faltarían ${formatMoney(missing)}.${futureCover ? ' Con los próximos ingresos sí podrías cubrirlo, pero no hagas pagos extra antes.' : ' Con los próximos ingresos aún puede haber un déficit, así que evita pagos extra.'}`
  }

  if (q.includes('qué pago primero') || q.includes('que pago primero')) {
    if (!rec.priorityOrder.length) {
      return 'No hay elementos de prioridad disponibles en este momento.'
    }
    const list = rec.priorityOrder.map((p, i) => `${i + 1}. ${p.name} (${p.status}) — ${formatMoney(p.amount)}`)
    return `Prioriza en este orden:\n${list.join('\n')}\n\n${rec.nextBestAction}`
  }

  // Generic spend/purchase/use/pay with amount
  const matchCantidad = q.match(/(\d+(?:[.,]\d+)?)/)
  if ((q.includes('puedo gastar') || q.includes('puedo comprar') || q.includes('puedo usar')) && matchCantidad) {
    const raw = matchCantidad[0].replace(',', '.')
    const amount = Number(raw)

    if (Number.isNaN(amount)) {
      return 'Necesito un monto válido para evaluar si puedes gastar esa cantidad.'
    }

    // If asking about after payday/income
    if (isAfterIncome) {
      const remainingAfterSpend = projectedAll - amount
      if (remainingAfterSpend >= 0) {
        return `Después del próximo ingreso, sí. Quedarías con aproximadamente ${formatMoney(remainingAfterSpend)} después de todas las obligaciones.`
      }
      return `No. Después del próximo ingreso, si gastas ${formatMoney(amount)}, quedarías corto por ${formatMoney(Math.abs(remainingAfterSpend))}.`
    }

   const criticalAmount =
  context.attentionItems?.reduce(
    (sum, item) =>
      ['overdue', 'in_grace', 'due_today'].includes(item.status)
        ? sum + Number(item.amount || 0)
        : sum,
    0
  ) || 0

if (cashAvailable < criticalAmount) {
  return `Hoy no lo recomiendo.

Tienes ${formatMoney(cashAvailable)} disponibles.

Tus compromisos críticos suman aproximadamente ${formatMoney(criticalAmount)}.

Aunque los próximos ingresos ayuden, no recomiendo gastar ${formatMoney(amount)} ahora.

Prioriza primero Honda, Toyota, Colegio Gaby, Agua y otros compromisos críticos.`
}

    const canSpend = cashAvailable >= criticalAmount + amount
    if (canSpend && rec.priorityOrder.length === 0) {
      return `Técnicamente sí. Tienes ${formatMoney(cashAvailable)} y si gastas ${formatMoney(amount)}, quedarías con ${formatMoney(cashAvailable - amount)}. Pero verifica que no haya obligaciones pendientes sin registrar.`
    }

    if (!canSpend) {
      const needed = totalObligations + amount - cashAvailable
      return `No. Si gastas ${formatMoney(amount)}, no cubrirías tus obligaciones. Te faltarían ${formatMoney(needed)}. Espera el próximo ingreso.`
    }

    if (context.recommendationLevel === 'ok') {
      return `Sí, se puede. Tienes ${formatMoney(cashAvailable)}, si gastas ${formatMoney(amount)} quedarías con ${formatMoney(cashAvailable - amount)} después de cubrir tus obligaciones.`
    }

    return `Técnicamente hay flujo, pero la situación es ajustada (${context.recommendationLevel}). Si es urgente, sí; si no, espera el próximo ingreso.`
  }

  if (q.includes('cuánto me sobra') || q.includes('cuánto sobra')) {
    if (isAfterIncome) {
      return `Después del próximo ingreso y de todas las obligaciones, te sobrarían ${formatMoney(projectedAll)}.`
    }
    return `Hoy tienes ${formatMoney(cashAvailable)} disponibles. Después de todas las obligaciones, ${formatMoney(projectedAll)}.`
  }

  if (q.includes('puedo gastar')) {
    return 'Necesito un monto (ejemplo: $200) para evaluar si puedes gastar esa cantidad.'
  }

  return `${rec.headline}\n${rec.summary}\n${rec.nextBestAction}`
}
