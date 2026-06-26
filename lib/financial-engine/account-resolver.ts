import { getConnectedAccounts } from './accounts'
import type {
  ConnectedAccount,
  DuplicateAccountGroup,
  FinancialSupabaseClient,
  ResolvedAccountsResult,
  ResolvedConnectedAccount,
} from './types'

function groupValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() || '__null__'
}

function accountGroupKey(account: ConnectedAccount) {
  return [
    groupValue(account.institution_name),
    groupValue(account.name),
    groupValue(account.type),
    groupValue(account.subtype),
  ].join('|')
}

function updatedAtTime(account: ConnectedAccount) {
  if (!account.updated_at) return 0

  const time = new Date(account.updated_at).getTime()
  return Number.isFinite(time) ? time : 0
}

function newestAccount(accounts: ConnectedAccount[]) {
  return accounts.reduce((newest, account) =>
    updatedAtTime(account) > updatedAtTime(newest) ? account : newest
  )
}

export async function getResolvedAccounts(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<ResolvedAccountsResult> {
  const connectedAccounts = await getConnectedAccounts(supabase, userId)
  const warnings: string[] = []
  const groups = new Map<string, ConnectedAccount[]>()

  for (const account of connectedAccounts) {
    const key = accountGroupKey(account)
    const group = groups.get(key) || []
    group.push(account)
    groups.set(key, group)
  }

  const resolvedAccounts: ResolvedConnectedAccount[] = []
  const duplicateGroups: DuplicateAccountGroup[] = []

  for (const [groupKey, sourceAccounts] of groups.entries()) {
    const selectedAccount = newestAccount(sourceAccounts)
    const duplicates = sourceAccounts.filter(
      (account) => account.id !== selectedAccount.id
    )
    const merged = sourceAccounts.length > 1

    if (merged) {
      duplicateGroups.push({
        groupKey,
        institution_name: selectedAccount.institution_name,
        name: selectedAccount.name,
        type: selectedAccount.type,
        subtype: selectedAccount.subtype,
        sourceAccounts,
      })

      warnings.push(
        `Merged ${sourceAccounts.length} plaid_accounts rows for ${[
          selectedAccount.institution_name,
          selectedAccount.name,
          selectedAccount.type,
          selectedAccount.subtype,
        ]
          .filter(Boolean)
          .join(' / ')}`
      )
    }

    resolvedAccounts.push({
      ...selectedAccount,
      sourceAccounts,
      merged,
      duplicates,
    })
  }

  return {
    resolvedAccounts,
    duplicateGroups,
    warnings,
  }
}
