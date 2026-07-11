import {
  canonicalCategoryCodeForText,
  getCategoryByCode,
  type CanonicalCategory,
} from './categories'
import { normalizeMerchantName } from './merchant-knowledge'
import type { ConfirmedLedgerDuplicateResolution } from './confirmed-ledger-duplicates'
import type { LedgerSummary, LedgerSummaryTransaction } from './ledger-summary'

export type CategoryConflictConfidence = 'low' | 'medium' | 'high'

export type DuplicateCategoryConflictEntry = {
  quickEntryId: string
  category: string
  canonicalCategoryCode: string
  canonicalCategoryLabel: string
  categoryKind: CanonicalCategory['kind']
  createdAt: string | null
  resolutionId: string
  resolutionType: ConfirmedLedgerDuplicateResolution['resolutionType']
}

export type ResolvedDuplicateCategoryConflict = {
  id: string
  fingerprint: string
  survivorQuickEntryId: string
  duplicateQuickEntryIds: string[]
  merchant: string
  normalizedMerchant: string
  date: string | null
  amount: number
  accountIdentity: string
  survivorCategory: string
  survivorCanonicalCategoryCode: string
  survivorCategoryKind: CanonicalCategory['kind']
  duplicateCategories: DuplicateCategoryConflictEntry[]
  suggestedCanonicalCategory: {
    code: string
    label: string
    kind: CanonicalCategory['kind']
  }
  confidence: CategoryConflictConfidence
  reason: string
  duplicateRowsDisagree: boolean
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function createdAt(transaction: LedgerSummaryTransaction) {
  return text(transaction.metadata.createdAt)
}

function accountIdentity(transaction: LedgerSummaryTransaction) {
  const institution = text(transaction.metadata.institutionName) || 'Unknown'
  const account = text(transaction.metadata.accountName) || 'Unknown account'
  const mask = text(transaction.metadata.accountMask)
  const accountType = text(transaction.metadata.accountType)

  return [institution, account, mask ? `••••${mask}` : null, accountType]
    .filter(Boolean)
    .join(' / ')
}

function categoryDetails(category: string | null) {
  const code = canonicalCategoryCodeForText(category)
  const canonicalCategory = code ? getCategoryByCode(code) : null

  if (!code || !canonicalCategory) return null

  return {
    code,
    label: canonicalCategory.displayName,
    kind: canonicalCategory.kind,
  }
}

function categoryCounts(
  survivorCode: string,
  duplicates: DuplicateCategoryConflictEntry[]
) {
  const counts = new Map<string, number>([[survivorCode, 1]])

  duplicates.forEach((duplicate) => {
    counts.set(
      duplicate.canonicalCategoryCode,
      (counts.get(duplicate.canonicalCategoryCode) || 0) + 1
    )
  })

  return counts
}

function suggestedCategory(
  survivorCategory: NonNullable<ReturnType<typeof categoryDetails>>,
  duplicates: DuplicateCategoryConflictEntry[]
) {
  const counts = categoryCounts(survivorCategory.code, duplicates)
  const sortedCounts = [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1]
    if (left[0] === survivorCategory.code) return -1
    if (right[0] === survivorCategory.code) return 1
    return left[0].localeCompare(right[0])
  })
  const code = sortedCounts[0]?.[0] || survivorCategory.code
  const category = getCategoryByCode(code) || getCategoryByCode(survivorCategory.code)

  return {
    code: category?.code || survivorCategory.code,
    label: category?.displayName || survivorCategory.label,
    kind: category?.kind || survivorCategory.kind,
  }
}

function confidenceFor({
  suggestedCode,
  survivorCode,
  duplicates,
  duplicateRowsDisagree,
}: {
  suggestedCode: string
  survivorCode: string
  duplicates: DuplicateCategoryConflictEntry[]
  duplicateRowsDisagree: boolean
}): CategoryConflictConfidence {
  if (duplicateRowsDisagree) return 'low'
  if (suggestedCode === survivorCode) return 'low'
  if (duplicates.length >= 2) return 'medium'
  return 'low'
}

function reasonFor({
  suggestedLabel,
  survivorLabel,
  duplicateRowsDisagree,
  duplicates,
}: {
  suggestedLabel: string
  survivorLabel: string
  duplicateRowsDisagree: boolean
  duplicates: DuplicateCategoryConflictEntry[]
}) {
  if (duplicateRowsDisagree) {
    return 'Duplicate-resolved rows disagree with each other, so this needs a human category choice.'
  }

  if (duplicates.length > 1 && suggestedLabel !== survivorLabel) {
    return `Most duplicate-resolved rows use ${suggestedLabel}, while the survivor uses ${survivorLabel}.`
  }

  return `The survivor uses ${survivorLabel}, but at least one duplicate-resolved row uses another valid category.`
}

export function getResolvedDuplicateCategoryConflicts(
  ledgerSummary: LedgerSummary
) {
  const transactionById = new Map(
    ledgerSummary.allConfirmedLedgerEntries.map((transaction) => [
      transaction.id,
      transaction,
    ])
  )
  const resolutionsBySurvivorId = new Map<
    string,
    ConfirmedLedgerDuplicateResolution[]
  >()

  ledgerSummary.confirmedLedgerDuplicateResolutions
    .filter((resolution) =>
      ['exact_duplicate', 'user_confirmed_duplicate'].includes(
        resolution.resolutionType
      )
    )
    .forEach((resolution) => {
      const existing =
        resolutionsBySurvivorId.get(resolution.survivorQuickEntryId) || []
      resolutionsBySurvivorId.set(resolution.survivorQuickEntryId, [
        ...existing,
        resolution,
      ])
    })

  return [...resolutionsBySurvivorId.entries()]
    .flatMap(([survivorQuickEntryId, resolutions]) => {
      const survivor = transactionById.get(survivorQuickEntryId)
      const survivorCategory = categoryDetails(survivor?.category || null)

      if (!survivor || !survivorCategory) return []

      const duplicateCategories = resolutions.flatMap((resolution) => {
        const duplicate = transactionById.get(resolution.duplicateQuickEntryId)
        const duplicateCategory = categoryDetails(duplicate?.category || null)

        if (!duplicate || !duplicateCategory) return []
        if (duplicateCategory.code === survivorCategory.code) return []

        return [{
          quickEntryId: duplicate.id,
          category: duplicate.category || duplicateCategory.label,
          canonicalCategoryCode: duplicateCategory.code,
          canonicalCategoryLabel: duplicateCategory.label,
          categoryKind: duplicateCategory.kind,
          createdAt: createdAt(duplicate),
          resolutionId: resolution.id,
          resolutionType: resolution.resolutionType,
        }]
      })

      if (duplicateCategories.length === 0) return []

      const duplicateCodeSet = new Set(
        resolutions.flatMap((resolution) => {
          const duplicate = transactionById.get(resolution.duplicateQuickEntryId)
          const duplicateCategory = categoryDetails(duplicate?.category || null)
          return duplicateCategory ? [duplicateCategory.code] : []
        })
      )
      const duplicateRowsDisagree = duplicateCodeSet.size > 1
      const suggested = suggestedCategory(survivorCategory, duplicateCategories)

      return [{
        id: `${survivor.id}:${resolutions
          .map((resolution) => resolution.duplicateQuickEntryId)
          .sort()
          .join(':')}`,
        fingerprint: resolutions[0]?.fingerprint || '',
        survivorQuickEntryId: survivor.id,
        duplicateQuickEntryIds: resolutions.map(
          (resolution) => resolution.duplicateQuickEntryId
        ),
        merchant: survivor.description || 'Unknown merchant',
        normalizedMerchant: normalizeMerchantName(survivor.description),
        date: survivor.date,
        amount: Math.abs(Number(survivor.amount || 0)),
        accountIdentity: accountIdentity(survivor),
        survivorCategory: survivor.category || survivorCategory.label,
        survivorCanonicalCategoryCode: survivorCategory.code,
        survivorCategoryKind: survivorCategory.kind,
        duplicateCategories,
        suggestedCanonicalCategory: suggested,
        confidence: confidenceFor({
          suggestedCode: suggested.code,
          survivorCode: survivorCategory.code,
          duplicates: duplicateCategories,
          duplicateRowsDisagree,
        }),
        reason: reasonFor({
          suggestedLabel: suggested.label,
          survivorLabel: survivorCategory.label,
          duplicateRowsDisagree,
          duplicates: duplicateCategories,
        }),
        duplicateRowsDisagree,
      }]
    })
    .sort((left, right) => {
      if (left.date !== right.date) {
        return String(right.date || '').localeCompare(String(left.date || ''))
      }
      return left.merchant.localeCompare(right.merchant)
    })
}
