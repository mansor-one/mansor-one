export type LegacyCandidateSource = 'quick_entries' | 'plaid_imports'

export async function promoteBeforeLinkingLegacyObligation<T>({
  source,
  candidateId,
  promotePlaid,
  linkConfirmedQuickEntry,
}: {
  source: LegacyCandidateSource
  candidateId: string
  promotePlaid: (plaidImportId: string) => Promise<{ quickEntryId: string }>
  linkConfirmedQuickEntry: (quickEntryId: string) => Promise<T>
}) {
  const quickEntryId = source === 'plaid_imports'
    ? (await promotePlaid(candidateId)).quickEntryId
    : candidateId

  return linkConfirmedQuickEntry(quickEntryId)
}
