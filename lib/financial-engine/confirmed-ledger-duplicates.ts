import type { FinancialSupabaseClient } from './types'
import type { LedgerSummaryTransaction } from './ledger-summary'

export type ConfirmedLedgerDuplicateResolutionType =
  | 'exact_duplicate'
  | 'user_confirmed_duplicate'
  | 'kept_separate'

export type ConfirmedLedgerDuplicateResolutionStatus = 'active' | 'reversed'

export type ConfirmedLedgerDuplicateResolution = {
  id: string
  userId: string
  duplicateQuickEntryId: string
  survivorQuickEntryId: string
  resolutionType: ConfirmedLedgerDuplicateResolutionType
  status: ConfirmedLedgerDuplicateResolutionStatus
  reason: string
  fingerprint: string
  resolvedAt: string
  resolvedBy: string | null
  reversedAt: string | null
  reversedBy: string | null
  sourceConnectionIds: string[]
  metadata: Record<string, unknown>
}

export type ConfirmedLedgerDuplicateGroupEntry = {
  transaction: LedgerSummaryTransaction
  resolution: ConfirmedLedgerDuplicateResolution | null
}

export type ConfirmedLedgerDuplicateGroup = {
  fingerprint: string
  survivor: LedgerSummaryTransaction
  entries: ConfirmedLedgerDuplicateGroupEntry[]
  duplicateAmount: number
  reasons: string[]
}

type ResolutionRow = {
  id: string
  user_id: string
  duplicate_quick_entry_id: string
  survivor_quick_entry_id: string
  resolution_type: ConfirmedLedgerDuplicateResolutionType
  status: ConfirmedLedgerDuplicateResolutionStatus
  reason: string
  fingerprint: string
  resolved_at: string
  resolved_by: string | null
  reversed_at: string | null
  reversed_by: string | null
  source_connection_ids?: string[] | null
  metadata?: Record<string, unknown> | null
}

export type CreateConfirmedLedgerDuplicateResolutionInput = {
  duplicateQuickEntryId: string
  survivorQuickEntryId: string
  resolutionType: ConfirmedLedgerDuplicateResolutionType
  reason: string
  fingerprint: string
  sourceConnectionIds?: string[]
  metadata?: Record<string, unknown>
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeText(value: unknown) {
  return String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' AND ')
    .replace(/[#*]\s*\d+/g, ' ')
    .replace(/\bSTORE\b/g, ' ')
    .replace(/\bPR\b/g, ' ')
    .replace(/\bPUERTO RICO\b/g, ' ')
    .replace(/\bINC\b/g, ' ')
    .replace(/\bLLC\b/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function amountCents(value: number) {
  return Math.round(Math.abs(Number(value || 0)) * 100)
}

function metadataText(transaction: LedgerSummaryTransaction, key: string) {
  return text(transaction.metadata[key])
}

function normalizedMetadataText(
  transaction: LedgerSummaryTransaction,
  key: string
) {
  return normalizeText(metadataText(transaction, key))
}

function accountMask(transaction: LedgerSummaryTransaction) {
  const mask = metadataText(transaction, 'accountMask')
  if (!mask) return 'unknown-mask'

  const digits = mask.replace(/\D/g, '')
  return digits ? digits.slice(-4) : normalizeText(mask)
}

export function confirmedLedgerDescriptionKey(
  transaction: LedgerSummaryTransaction
) {
  return normalizeText(transaction.description)
}

export function confirmedLedgerAccountIdentityKey(
  transaction: LedgerSummaryTransaction
) {
  return [
    normalizedMetadataText(transaction, 'institutionName') || 'UNKNOWN',
    normalizedMetadataText(transaction, 'accountName') || 'UNKNOWN',
    accountMask(transaction),
    normalizedMetadataText(transaction, 'accountType') || 'UNKNOWN',
    normalizedMetadataText(transaction, 'accountSubtype') || 'UNKNOWN',
  ].join(':')
}

export function confirmedLedgerDuplicateFingerprint(
  transaction: LedgerSummaryTransaction
) {
  return [
    'confirmed-ledger-v1',
    confirmedLedgerDescriptionKey(transaction),
    transaction.date || 'unknown-date',
    amountCents(transaction.amount),
    confirmedLedgerAccountIdentityKey(transaction),
  ].join('|')
}

export function confirmedLedgerAccountIdentityMatches(
  left: LedgerSummaryTransaction,
  right: LedgerSummaryTransaction
) {
  const leftPlaidAccountId = metadataText(left, 'plaidAccountId')
  const rightPlaidAccountId = metadataText(right, 'plaidAccountId')

  if (leftPlaidAccountId && rightPlaidAccountId && leftPlaidAccountId === rightPlaidAccountId) {
    return true
  }

  const leftInstitution = normalizedMetadataText(left, 'institutionName')
  const rightInstitution = normalizedMetadataText(right, 'institutionName')
  const leftAccount = normalizedMetadataText(left, 'accountName')
  const rightAccount = normalizedMetadataText(right, 'accountName')
  const leftType = normalizedMetadataText(left, 'accountType')
  const rightType = normalizedMetadataText(right, 'accountType')
  const leftSubtype = normalizedMetadataText(left, 'accountSubtype')
  const rightSubtype = normalizedMetadataText(right, 'accountSubtype')
  const leftMask = accountMask(left)
  const rightMask = accountMask(right)

  if (!leftInstitution || !rightInstitution) return false
  if (!leftAccount || !rightAccount) return false
  if (leftInstitution !== rightInstitution) return false
  if (leftAccount !== rightAccount) return false
  if (leftMask !== 'unknown-mask' || rightMask !== 'unknown-mask') {
    return leftMask === rightMask
  }
  if (leftType && rightType && leftType !== rightType) return false
  if (leftSubtype && rightSubtype && leftSubtype !== rightSubtype) return false

  return true
}

export function confirmedLedgerEntriesMatchExactly(
  left: LedgerSummaryTransaction,
  right: LedgerSummaryTransaction
) {
  return (
    left.id !== right.id &&
    left.date === right.date &&
    amountCents(left.amount) === amountCents(right.amount) &&
    confirmedLedgerDescriptionKey(left) === confirmedLedgerDescriptionKey(right) &&
    confirmedLedgerAccountIdentityMatches(left, right)
  )
}

function rowToResolution(
  row: ResolutionRow
): ConfirmedLedgerDuplicateResolution {
  return {
    id: row.id,
    userId: row.user_id,
    duplicateQuickEntryId: row.duplicate_quick_entry_id,
    survivorQuickEntryId: row.survivor_quick_entry_id,
    resolutionType: row.resolution_type,
    status: row.status,
    reason: row.reason,
    fingerprint: row.fingerprint,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    reversedAt: row.reversed_at,
    reversedBy: row.reversed_by,
    sourceConnectionIds: row.source_connection_ids || [],
    metadata: row.metadata || {},
  }
}

function isMissingResolutionTableError(error: { code?: string; message?: string }) {
  const message = error.message || ''
  return error.code === '42P01' || message.includes('confirmed_ledger_duplicate_resolutions')
}

export async function getConfirmedLedgerDuplicateResolutions(
  supabase: FinancialSupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from('confirmed_ledger_duplicate_resolutions')
    .select(
      'id, user_id, duplicate_quick_entry_id, survivor_quick_entry_id, resolution_type, status, reason, fingerprint, resolved_at, resolved_by, reversed_at, reversed_by, source_connection_ids, metadata'
    )
    .eq('user_id', userId)
    .eq('status', 'active')

  if (error) {
    if (isMissingResolutionTableError(error)) return []
    throw error
  }

  return ((data || []) as ResolutionRow[]).map(rowToResolution)
}

export function resolutionByDuplicateQuickEntryId(
  resolutions: ConfirmedLedgerDuplicateResolution[]
) {
  return new Map(
    resolutions.map((resolution) => [
      resolution.duplicateQuickEntryId,
      resolution,
    ])
  )
}

export function isDuplicateResolved(
  transaction: LedgerSummaryTransaction,
  resolutions: ConfirmedLedgerDuplicateResolution[]
) {
  const resolution = resolutionByDuplicateQuickEntryId(resolutions).get(
    transaction.id
  )

  return Boolean(
    resolution &&
      ['exact_duplicate', 'user_confirmed_duplicate'].includes(
        resolution.resolutionType
      )
  )
}

export function activeConfirmedLedgerEntries(
  transactions: LedgerSummaryTransaction[],
  resolutions: ConfirmedLedgerDuplicateResolution[]
) {
  return transactions.filter(
    (transaction) => !isDuplicateResolved(transaction, resolutions)
  )
}

function createdAtTime(transaction: LedgerSummaryTransaction) {
  const value = text(transaction.metadata.createdAt)
  if (!value) return 0

  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function compareSurvivorCandidate(
  left: LedgerSummaryTransaction,
  right: LedgerSummaryTransaction
) {
  return (
    createdAtTime(left) - createdAtTime(right) ||
    String(left.date || '').localeCompare(String(right.date || '')) ||
    left.id.localeCompare(right.id)
  )
}

export function buildConfirmedLedgerDuplicateGroups(
  transactions: LedgerSummaryTransaction[],
  resolutions: ConfirmedLedgerDuplicateResolution[]
) {
  const resolutionByDuplicateId = resolutionByDuplicateQuickEntryId(resolutions)
  const groups = new Map<string, LedgerSummaryTransaction[]>()

  transactions
    .filter((transaction) => transaction.sourceTable === 'quick_entries')
    .forEach((transaction) => {
      const fingerprint = confirmedLedgerDuplicateFingerprint(transaction)
      const group = groups.get(fingerprint) || []
      group.push(transaction)
      groups.set(fingerprint, group)
    })

  return [...groups.entries()]
    .flatMap(([fingerprint, entries]) => {
      if (entries.length < 2) return []

      const sortedEntries = [...entries].sort(compareSurvivorCandidate)
      const survivor = sortedEntries[0]
      const unresolvedEntries = sortedEntries.filter(
        (entry) => !resolutionByDuplicateId.has(entry.id)
      )

      if (unresolvedEntries.length < 2) return []

      const duplicateAmount = sortedEntries
        .slice(1)
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)

      return [{
        fingerprint,
        survivor,
        entries: sortedEntries.map((transaction) => ({
          transaction,
          resolution: resolutionByDuplicateId.get(transaction.id) || null,
        })),
        duplicateAmount,
        reasons: [
          'Same normalized merchant or description.',
          'Same transaction date.',
          'Same absolute amount.',
          'Same resolved institution and account identity.',
        ],
      }]
    })
    .sort((left, right) => {
      if (right.duplicateAmount !== left.duplicateAmount) {
        return right.duplicateAmount - left.duplicateAmount
      }
      return left.fingerprint.localeCompare(right.fingerprint)
    })
}

export async function createConfirmedLedgerDuplicateResolution(
  supabase: FinancialSupabaseClient,
  userId: string,
  input: CreateConfirmedLedgerDuplicateResolutionInput
) {
  if (input.duplicateQuickEntryId === input.survivorQuickEntryId) {
    throw new Error('Duplicate and survivor quick entries must be different.')
  }

  const { data, error } = await supabase
    .from('confirmed_ledger_duplicate_resolutions')
    .insert({
      user_id: userId,
      duplicate_quick_entry_id: input.duplicateQuickEntryId,
      survivor_quick_entry_id: input.survivorQuickEntryId,
      resolution_type: input.resolutionType,
      reason: input.reason,
      fingerprint: input.fingerprint,
      resolved_by: userId,
      source_connection_ids: input.sourceConnectionIds || [],
      metadata: input.metadata || {},
    })
    .select(
      'id, user_id, duplicate_quick_entry_id, survivor_quick_entry_id, resolution_type, status, reason, fingerprint, resolved_at, resolved_by, reversed_at, reversed_by, source_connection_ids, metadata'
    )
    .single()

  if (error) throw error

  return rowToResolution(data as ResolutionRow)
}
