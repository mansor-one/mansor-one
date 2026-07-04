import type {
  ConnectedAccount,
  CreditCard,
  FinancialSupabaseClient,
  ManualAccount,
} from './types'

export const manualAccountOwnerOptions = [
  { value: 'household', label: 'Household' },
  { value: 'manuel', label: 'Manuel' },
  { value: 'soraya', label: 'Soraya' },
  { value: 'business', label: 'Business' },
  { value: 'future_entity', label: 'Future entity' },
]

export const manualAccountStatusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'archived', label: 'Archived' },
] as const

export type ManualAccountStatus =
  (typeof manualAccountStatusOptions)[number]['value']

export const plaidConnectionStatusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'reconnect_needed', label: 'Reconnect needed' },
] as const

export type PlaidConnectionStatus =
  (typeof plaidConnectionStatusOptions)[number]['value'] | 'revoked'

export type PlaidConnectionSummary = {
  id: string
  institution_name: string | null
  status: PlaidConnectionStatus | string | null
  created_at: string | null
  archived_at: string | null
  archive_reason: string | null
  last_sync_at: string | null
  last_sync_error: string | null
  status_updated_at: string | null
  disconnected_at: string | null
  linkedAccountsCount: number
}

export type PortfolioPlaidAccount = ConnectedAccount & {
  connection_status?: PlaidConnectionStatus | string | null
  connection_archived_at?: string | null
  connection_disconnected_at?: string | null
  connection_archive_reason?: string | null
}

export type PortfolioManagementData = {
  manualAccounts: ManualAccount[]
  activeManualAccounts: ManualAccount[]
  hiddenManualAccounts: ManualAccount[]
  archivedManualAccounts: ManualAccount[]
  plaidAccounts: PortfolioPlaidAccount[]
  activePlaidAccounts: PortfolioPlaidAccount[]
  hiddenPlaidAccounts: PortfolioPlaidAccount[]
  archivedPlaidAccounts: PortfolioPlaidAccount[]
  historicalPlaidAccounts: PortfolioPlaidAccount[]
  plaidConnections: PlaidConnectionSummary[]
  activePlaidConnections: PlaidConnectionSummary[]
  archivedPlaidConnections: PlaidConnectionSummary[]
  reconnectNeededPlaidConnections: PlaidConnectionSummary[]
  revokedPlaidConnections: PlaidConnectionSummary[]
  creditCards: CreditCard[]
  loans: Array<{
    id?: string
    name?: string | null
    liability_type?: string | null
    lender?: string | null
    owner?: string | null
    balance?: number | null
    apr?: number | null
    monthly_payment?: number | null
    due_day?: number | null
    is_active?: boolean | null
  }>
}

export type UpdateManualAccountInput = {
  id: string
  userId: string
  name: string
  balance: number
  ownerScope: string
  status: ManualAccountStatus
  isSpendable: boolean
  replacementAccountId: string | null
  archiveReason: string | null
}

export type UpdatePlaidAccountInput = {
  id: string
  userId: string
  displayName: string
  ownerScope: string
  status: ManualAccountStatus
  includeInDashboard: boolean
  archiveReason: string | null
}

export type UpdatePlaidConnectionInput = {
  id: string
  userId: string
  status: PlaidConnectionStatus
  archiveReason: string | null
}

function normalizedStatus(value: string): ManualAccountStatus {
  if (value === 'hidden' || value === 'archived') return value
  return 'active'
}

function normalizedConnectionStatus(value: string): PlaidConnectionStatus {
  if (value === 'revoked') return value
  if (value === 'archived' || value === 'reconnect_needed') return value
  return 'active'
}

function normalizedOwnerScope(value: string) {
  return value.trim() || 'household'
}

function accountIsArchived(account: ManualAccount) {
  return account.account_status === 'archived' || account.is_active === false
}

function accountIsHidden(account: ManualAccount) {
  return (
    !accountIsArchived(account) &&
    (account.account_status === 'hidden' || account.is_hidden === true)
  )
}

function connectedAccountIsArchived(account: ConnectedAccount) {
  return account.account_status === 'archived'
}

function connectedAccountIsHidden(account: ConnectedAccount) {
  return (
    !connectedAccountIsArchived(account) &&
    (account.account_status === 'hidden' || account.is_hidden === true)
  )
}

function connectionIsDashboardActive(
  connection: PlaidConnectionSummary | undefined
) {
  return (
    normalizedConnectionStatus(connection?.status || 'active') === 'active' &&
    !connection?.archived_at &&
    !connection?.disconnected_at
  )
}

function connectedAccountIsHistorical(account: PortfolioPlaidAccount) {
  return (
    normalizedConnectionStatus(account.connection_status || 'active') !==
      'active' ||
    Boolean(account.connection_archived_at) ||
    Boolean(account.connection_disconnected_at)
  )
}

export async function getPortfolioManagementData(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<PortfolioManagementData> {
  const [
    manualAccountsResult,
    plaidAccountsResult,
    plaidConnectionsResult,
    creditCardsResult,
    loansResult,
  ] = await Promise.all([
    supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true }),
    supabase
      .from('plaid_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('institution_name', { ascending: true }),
    supabase
      .from('plaid_connections')
      .select(
        'id, institution_name, status, created_at, archived_at, archive_reason, last_sync_at, last_sync_error, status_updated_at, disconnected_at'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('credit_cards')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true }),
    supabase
      .from('liabilities')
      .select('*')
      .eq('is_active', true)
      .order('balance', { ascending: false }),
  ])

  if (manualAccountsResult.error) throw manualAccountsResult.error
  if (plaidAccountsResult.error) throw plaidAccountsResult.error
  if (plaidConnectionsResult.error) throw plaidConnectionsResult.error
  if (creditCardsResult.error) throw creditCardsResult.error
  if (loansResult.error) throw loansResult.error

  const manualAccounts = (manualAccountsResult.data || []) as ManualAccount[]
  const rawPlaidAccounts = (plaidAccountsResult.data || []) as ConnectedAccount[]
  const accountCountByConnectionId = new Map<string, number>()

  for (const account of rawPlaidAccounts) {
    if (!account.connection_id) continue
    accountCountByConnectionId.set(
      account.connection_id,
      (accountCountByConnectionId.get(account.connection_id) || 0) + 1
    )
  }

  const plaidConnections = (plaidConnectionsResult.data || []).map(
    (connection) =>
      ({
        ...connection,
        linkedAccountsCount: accountCountByConnectionId.get(connection.id) || 0,
      }) as PlaidConnectionSummary
  )
  const connectionById = new Map(
    plaidConnections.map((connection) => [connection.id, connection])
  )
  const plaidAccounts = rawPlaidAccounts.map((account) => {
    const connection = account.connection_id
      ? connectionById.get(account.connection_id)
      : undefined

    return {
      ...account,
      connection_status: connection?.status || null,
      connection_archived_at: connection?.archived_at || null,
      connection_disconnected_at: connection?.disconnected_at || null,
      connection_archive_reason: connection?.archive_reason || null,
    } as PortfolioPlaidAccount
  })
  const archivedManualAccounts = manualAccounts.filter(accountIsArchived)
  const hiddenManualAccounts = manualAccounts.filter(accountIsHidden)
  const activeManualAccounts = manualAccounts.filter(
    (account) => !accountIsArchived(account) && !accountIsHidden(account)
  )
  const historicalPlaidAccounts = plaidAccounts.filter(
    connectedAccountIsHistorical
  )
  const currentPlaidAccounts = plaidAccounts.filter(
    (account) => !connectedAccountIsHistorical(account)
  )
  const archivedPlaidAccounts = currentPlaidAccounts.filter(
    connectedAccountIsArchived
  )
  const hiddenPlaidAccounts = currentPlaidAccounts.filter(
    connectedAccountIsHidden
  )
  const activePlaidAccounts = plaidAccounts.filter(
    (account) =>
      !connectedAccountIsHistorical(account) &&
      !connectedAccountIsArchived(account) && !connectedAccountIsHidden(account)
  )
  const activePlaidConnections = plaidConnections.filter(
    (connection) => connectionIsDashboardActive(connection)
  )
  const archivedPlaidConnections = plaidConnections.filter(
    (connection) =>
      normalizedConnectionStatus(connection.status || 'active') === 'archived'
  )
  const reconnectNeededPlaidConnections = plaidConnections.filter(
    (connection) =>
      normalizedConnectionStatus(connection.status || 'active') ===
      'reconnect_needed'
  )
  const revokedPlaidConnections = plaidConnections.filter(
    (connection) =>
      normalizedConnectionStatus(connection.status || 'active') === 'revoked'
  )

  return {
    manualAccounts,
    activeManualAccounts,
    hiddenManualAccounts,
    archivedManualAccounts,
    plaidAccounts,
    activePlaidAccounts,
    hiddenPlaidAccounts,
    archivedPlaidAccounts,
    historicalPlaidAccounts,
    plaidConnections,
    activePlaidConnections,
    archivedPlaidConnections,
    reconnectNeededPlaidConnections,
    revokedPlaidConnections,
    creditCards: (creditCardsResult.data || []) as CreditCard[],
    loans: loansResult.data || [],
  }
}

export async function updatePlaidConnection(
  supabase: FinancialSupabaseClient,
  input: UpdatePlaidConnectionInput
) {
  const status = normalizedConnectionStatus(input.status)
  const now = new Date().toISOString()

  const row = {
    status,
    archived_at: status === 'archived' ? now : null,
    archive_reason:
      status === 'archived' ? input.archiveReason?.trim() || null : null,
    last_sync_error:
      status === 'reconnect_needed'
        ? input.archiveReason?.trim() || 'Reconnect needed'
        : null,
    status_updated_at: now,
  }

  const { data, error } = await supabase
    .from('plaid_connections')
    .update(row)
    .eq('id', input.id)
    .eq('user_id', input.userId)
    .select(
      'id, institution_name, status, created_at, archived_at, archive_reason, last_sync_at, last_sync_error, status_updated_at, disconnected_at'
    )
    .single()

  if (error) throw error

  return {
    ...(data as Omit<PlaidConnectionSummary, 'linkedAccountsCount'>),
    linkedAccountsCount: 0,
  } as PlaidConnectionSummary
}

export async function updatePlaidAccount(
  supabase: FinancialSupabaseClient,
  input: UpdatePlaidAccountInput
) {
  const displayName = input.displayName.trim()
  const status = normalizedStatus(input.status)
  const now = new Date().toISOString()

  if (!displayName) {
    throw new Error('Plaid account display name is required.')
  }

  const includeInDashboard =
    status === 'active' ? input.includeInDashboard : false

  const row = {
    display_name: displayName,
    owner_scope: normalizedOwnerScope(input.ownerScope),
    account_status: status,
    is_hidden: status !== 'active',
    include_in_dashboard: includeInDashboard,
    hidden_at: status === 'hidden' ? now : null,
    archived_at: status === 'archived' ? now : null,
    archive_reason:
      status === 'archived' ? input.archiveReason?.trim() || null : null,
    portfolio_updated_at: now,
  }

  const { data, error } = await supabase
    .from('plaid_accounts')
    .update(row)
    .eq('id', input.id)
    .eq('user_id', input.userId)
    .select('*')
    .single()

  if (error) throw error

  return data as ConnectedAccount
}

export async function updateManualAccount(
  supabase: FinancialSupabaseClient,
  input: UpdateManualAccountInput
) {
  const name = input.name.trim()
  const status = normalizedStatus(input.status)
  const now = new Date().toISOString()

  if (!name) {
    throw new Error('Account name is required.')
  }

  if (!Number.isFinite(input.balance)) {
    throw new Error('Account balance must be a valid number.')
  }

  const replacementAccountId =
    input.replacementAccountId && input.replacementAccountId !== input.id
      ? input.replacementAccountId
      : null

  if (replacementAccountId) {
    const { count, error } = await supabase
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('id', replacementAccountId)
      .eq('user_id', input.userId)

    if (error) throw error
    if (!count) {
      throw new Error('Replacement account was not found for this user.')
    }
  }

  const row = {
    name,
    balance: input.balance,
    owner_scope: normalizedOwnerScope(input.ownerScope),
    account_status: status,
    is_active: status !== 'archived',
    is_hidden: status !== 'active',
    is_spendable: input.isSpendable,
    hidden_at: status === 'hidden' ? now : null,
    archived_at: status === 'archived' ? now : null,
    archive_reason:
      status === 'archived' ? input.archiveReason?.trim() || null : null,
    replacement_account_id: replacementAccountId,
    updated_at: now,
  }

  const { data, error } = await supabase
    .from('accounts')
    .update(row)
    .eq('id', input.id)
    .eq('user_id', input.userId)
    .select('*')
    .single()

  if (error) throw error

  return data as ManualAccount
}
