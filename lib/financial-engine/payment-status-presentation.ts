export type PaymentPresentationInput = {
  status?: string | null
  lifecycleState?: string | null
  amount?: number | null
  dueDate?: string | null
  graceDate?: string | null
  evidenceDate?: string | null
  reconciledDate?: string | null
  confidence?: number | null
  today?: string
}

export type PaymentStatusTone = 'overdue' | 'grace' | 'due_soon' | 'possible_match' | 'in_transit' | 'reconciled' | 'scheduled' | 'invalid'
const DAY = 86_400_000

function dateKey(value: string | null | undefined) { return value?.slice(0, 10) || null }
function daysBetween(left: string, right: string) { return Math.round((new Date(`${left}T00:00:00Z`).getTime() - new Date(`${right}T00:00:00Z`).getTime()) / DAY) }
function formatSpanishDate(value: string) { return new Intl.DateTimeFormat('es-PR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) }

function normalizedStatus(input: PaymentPresentationInput) {
  const status = String(input.status || input.lifecycleState || 'scheduled').toLowerCase()
  if (!Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0 || ['incomplete', 'needs_review', 'invalid'].includes(status)) return 'invalid'
  if (['paid', 'matched', 'reconciled', 'closed', 'confirmed'].includes(status)) return 'reconciled'
  if (['in_transit', 'pending_settlement', 'initiated'].includes(status)) return 'in_transit'
  if (['possible_match', 'payment_detected', 'detected'].includes(status)) return 'possible_match'
  if (['overdue', 'late', 'missed'].includes(status)) return 'overdue'
  if (['grace_period', 'grace'].includes(status)) return 'grace'
  if (['due_soon', 'due_today'].includes(status)) return 'due_soon'
  return 'scheduled'
}

function possibleMatchStyle(confidence: number | null) {
  if (confidence !== null && confidence >= 90) return { classes: 'border-blue-400 bg-blue-950/70 text-blue-50', confidenceStrength: 'alta' as const }
  if (confidence !== null && confidence >= 70) return { classes: 'border-sky-700 bg-sky-950/55 text-sky-100', confidenceStrength: 'moderada' as const }
  return { classes: 'border-amber-800 bg-amber-950/35 text-amber-100', confidenceStrength: 'requiere revisión' as const }
}

export function paymentStatusPresentation(input: PaymentPresentationInput) {
  const rawStatus = String(input.status || input.lifecycleState || 'scheduled').toLowerCase()
  const tone = normalizedStatus(input) as PaymentStatusTone
  const today = dateKey(input.today) || new Date().toISOString().slice(0, 10)
  const dueDate = dateKey(input.dueDate)
  const graceDate = dateKey(input.graceDate)
  const evidenceDate = dateKey(input.evidenceDate)
  const reconciledDate = dateKey(input.reconciledDate)
  const confidence = input.confidence === null || input.confidence === undefined ? null : Number(input.confidence)
  const early = tone === 'in_transit' && Boolean(evidenceDate && dueDate && evidenceDate < dueDate)
  let label = 'Programado', icon = '◷', explanation = 'Está dentro del horizonte activo, pero todavía no requiere acción.'
  let classes = 'border-slate-700 bg-slate-950/65 text-slate-200'
  let relativeLabel: string | null = null
  let confidenceStrength: 'alta' | 'moderada' | 'requiere revisión' | null = null

  if (tone === 'overdue') {
    label = 'Vencido'; icon = '⚠'; classes = 'border-red-700 bg-red-950/55 text-red-100'; explanation = 'La fecha de vencimiento y el período de gracia ya pasaron sin un pago confirmado.'
    const deadline = graceDate || dueDate
    if (deadline) { const days = Math.max(daysBetween(today, deadline), 0); relativeLabel = `Vencido hace ${days} ${days === 1 ? 'día' : 'días'}` }
  } else if (tone === 'grace') {
    label = 'En período de gracia'; icon = '◔'; classes = 'border-orange-600 bg-orange-950/55 text-orange-100'; explanation = 'El vencimiento contractual pasó, pero aún estás dentro del período de gracia.'
    if (graceDate) relativeLabel = `Quedan ${Math.max(daysBetween(graceDate, today), 0)} días de gracia`
  } else if (tone === 'due_soon') {
    label = dueDate === today ? 'Vence hoy' : 'Próximo a vencer'; icon = '◷'; classes = 'border-amber-600 bg-amber-950/50 text-amber-100'; explanation = 'Vence dentro de los próximos 7 días.'
    if (dueDate) { const days = Math.max(daysBetween(dueDate, today), 0); relativeLabel = days === 0 ? 'Vence hoy' : `Vence en ${days} ${days === 1 ? 'día' : 'días'}` }
  } else if (tone === 'possible_match') {
    label = 'Posible pago detectado'; icon = '⌕'; explanation = 'Encontramos una posible transacción, pero todavía debes confirmarla.'
    const style = possibleMatchStyle(confidence); classes = style.classes; confidenceStrength = style.confidenceStrength
  } else if (tone === 'in_transit') {
    label = early ? 'Pago anticipado reportado' : 'Pagado, esperando confirmación'; icon = '↻'; classes = 'border-cyan-500 bg-cyan-950/55 text-cyan-50'
    explanation = early ? 'El pago fue reportado antes del vencimiento y está esperando confirmación bancaria.' : 'El pago fue reportado recientemente y está esperando confirmación bancaria.'
    if (evidenceDate) { const days = Math.max(daysBetween(today, evidenceDate), 0); relativeLabel = `Pago reportado hace ${days} ${days === 1 ? 'día' : 'días'}` }
  } else if (tone === 'reconciled') {
    label = 'Conciliado'; icon = '✓'; classes = 'border-emerald-700 bg-emerald-950/55 text-emerald-100'; explanation = 'El pago está confirmado y vinculado al historial financiero.'
    if (reconciledDate || evidenceDate) relativeLabel = `Conciliado el ${formatSpanishDate((reconciledDate || evidenceDate) as string)}`
  } else if (tone === 'invalid') {
    label = 'Configuración incompleta'; icon = '◇'; classes = 'border-violet-700 bg-violet-950/50 text-violet-100'
    explanation = Number(input.amount || 0) <= 0 ? 'El monto no está configurado y esta obligación no participa en totales ni proyecciones.' : 'Falta información necesaria para calcular esta obligación con seguridad.'
  } else if (rawStatus === 'future') explanation = 'Está programado después del horizonte actual.'

  return { tone, label, icon, explanation, classes, relativeLabel, confidence, confidenceStrength, early }
}
