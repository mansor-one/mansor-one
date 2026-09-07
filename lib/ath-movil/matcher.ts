import type { AthEvidenceForMatching, AthMatchReason, PlaidAthCandidate, ScoredAthCandidate } from './types'

export const ATH_MATCH_SCORE_VERSION = 'ath-match-v1'

export function shouldCreateAthCandidate(existingStatus: string | null | undefined) {
  return !existingStatus
}

function normalized(value: string | null | undefined) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function minutesBetween(left: string | null, right: string) {
  if (!left) return null
  const difference = Math.abs(new Date(left).getTime() - new Date(`${right.slice(0, 10)}T12:00:00-04:00`).getTime())
  return Math.round(difference / 60_000)
}

function active(candidate: PlaidAthCandidate) {
  return !candidate.pending && candidate.transactionStatus === 'active' && !candidate.removedAt && !candidate.supersededAt && candidate.amountCents > 0
}

export function scoreAthCandidate(email: AthEvidenceForMatching, transaction: PlaidAthCandidate) {
  if (email.householdId !== transaction.householdId || !active(transaction)) return null
  const reasons: AthMatchReason[] = []
  const amountExact = email.amountCents !== null && Math.abs(email.amountCents) === Math.abs(transaction.amountCents)
  reasons.push(amountExact
    ? { code: 'amount_exact', positive: true, points: 40, message: `El importe coincide exactamente: $${(Math.abs(transaction.amountCents) / 100).toFixed(2)}.` }
    : { code: 'amount_mismatch', positive: false, points: 0, message: 'El importe no coincide exactamente.' })

  const timeDifferenceMinutes = minutesBetween(email.occurredAt, transaction.transactionDate)
  const dayDifference = timeDifferenceMinutes === null ? null : Math.floor(timeDifferenceMinutes / 1440)
  const timePoints = dayDifference === null ? 0 : dayDifference === 0 ? 20 : dayDifference <= 1 ? 16 : dayDifference <= 3 ? 8 : 0
  reasons.push(timePoints > 0
    ? { code: 'time_close', positive: true, points: timePoints, message: dayDifference === 0 ? 'El correo y la transacción corresponden al mismo día.' : `La diferencia es de ${dayDifference} día(s).` }
    : { code: 'time_outside_window', positive: false, points: 0, message: 'La fecha está fuera de la ventana de coincidencia.' })

  const directionCompatible =
    (email.direction === 'sent' && transaction.signedAmountCents > 0) ||
    (email.direction === 'received' && transaction.signedAmountCents < 0) ||
    email.direction === 'internal_transfer'
  reasons.push(directionCompatible
    ? { code: 'direction_compatible', positive: true, points: 10, message: 'La dirección ATH es compatible con el débito bancario.' }
    : { code: 'direction_mismatch', positive: false, points: 0, message: 'La dirección ATH no coincide con el impacto bancario.' })

  const accountText = normalized(`${transaction.accountName || ''} ${transaction.accountMask || ''}`)
  const descriptor = normalized(`${email.sourceDescriptor || ''} ${email.destinationDescriptor || ''}`)
  const normalizedAccountName = normalized(transaction.accountName)
  const accountCompatible = Boolean(
    descriptor && accountText && (
      (transaction.accountMask && descriptor.includes(transaction.accountMask)) ||
      (normalizedAccountName.length >= 4 && (
        descriptor.includes(normalizedAccountName) || normalizedAccountName.includes(descriptor)
      ))
    )
  )
  reasons.push(accountCompatible
    ? { code: 'account_compatible', positive: true, points: 10, message: 'La cuenta o tarjeta indicada es compatible.' }
    : { code: 'account_unknown', positive: false, points: 0, message: 'No pudimos confirmar la cuenta desde el correo.' })

  const referenceExact = Boolean(email.reference && transaction.reference && normalized(email.reference) === normalized(transaction.reference))
  reasons.push(referenceExact
    ? { code: 'reference_exact', positive: true, points: 15, message: 'La referencia coincide exactamente.' }
    : email.reference
      ? { code: 'reference_unavailable_in_plaid', positive: false, points: 0, message: 'Plaid no expone una referencia compatible para comparar.' }
      : { code: 'reference_missing', positive: false, points: 0, message: 'El correo no incluye una referencia utilizable.' })

  const name = normalized(email.counterpartyName)
  const merchant = normalized(transaction.merchant)
  const nameCompatible = Boolean(name && merchant && (name.includes(merchant) || merchant.includes(name)))
  reasons.push(nameCompatible
    ? { code: 'counterparty_compatible', positive: true, points: 5, message: 'La persona o comercio es compatible.' }
    : { code: 'counterparty_uncertain', positive: false, points: 0, message: 'La persona o comercio no coincide claramente.' })

  let score = reasons.reduce((sum, reason) => sum + reason.points, 0)
  if (!amountExact || !directionCompatible) score = Math.min(score, 69)
  return { score, timeDifferenceMinutes, reasons }
}

export function buildAthMatchCandidates(email: AthEvidenceForMatching, transactions: PlaidAthCandidate[]): ScoredAthCandidate[] {
  const scored = transactions
    .map((transaction) => ({ transaction, result: scoreAthCandidate(email, transaction) }))
    .filter((item): item is { transaction: PlaidAthCandidate; result: NonNullable<ReturnType<typeof scoreAthCandidate>> } => Boolean(item.result))
    .filter((item) => item.result.score >= 40)
    .filter((item) => item.result.reasons.some((reason) => reason.code === 'amount_exact' && reason.positive))
    .filter((item) => item.result.reasons.some((reason) => reason.code === 'direction_compatible' && reason.positive))
    .sort((left, right) => right.result.score - left.result.score || (left.result.timeDifferenceMinutes ?? Number.MAX_SAFE_INTEGER) - (right.result.timeDifferenceMinutes ?? Number.MAX_SAFE_INTEGER) || left.transaction.id.localeCompare(right.transaction.id))
    .slice(0, 3)
  const top = scored[0]?.result.score ?? -1
  const second = scored[1]?.result.score ?? -1
  const ambiguous = top === second || (second >= 0 && top - second <= 5) || scored.filter((item) => item.transaction.amountCents === scored[0]?.transaction.amountCents).length > 1

  return scored.map((item, index) => ({
    athEmailId: email.id,
    plaidImportId: item.transaction.id,
    score: item.result.score,
    rank: index + 1,
    strength: item.result.score >= 85 ? 'strong' : item.result.score >= 70 ? 'possible' : 'weak',
    ambiguous,
    timeDifferenceMinutes: item.result.timeDifferenceMinutes,
    reasons: item.result.reasons,
  }))
}
