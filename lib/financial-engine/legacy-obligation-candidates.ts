export type LegacyObligationCandidate = {
  entry_date: string
  description: string
  amount: number
  account_name: string | null
  exactAmount: boolean
}

function normalized(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export function filterLegacyObligationCandidates<
  T extends LegacyObligationCandidate,
>(candidates: T[], search: string) {
  const query = normalized(search)
  if (!query) return { candidates, usedExactAmountFallback: false }

  const matching = candidates.filter((candidate) =>
    [
      candidate.entry_date,
      candidate.description,
      candidate.account_name,
      candidate.amount,
    ].some((value) => normalized(value).includes(query))
  )

  if (matching.length > 0) {
    return { candidates: matching, usedExactAmountFallback: false }
  }

  return {
    candidates: candidates.filter((candidate) => candidate.exactAmount),
    usedExactAmountFallback: true,
  }
}
