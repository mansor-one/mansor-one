import { getCardsSummary } from './cards'
import { getResolvedDuplicateCategoryConflicts } from './category-conflicts'
import { getLedgerSummary } from './ledger-summary'
import { getPlanningSummary } from './planning'
import { getPortfolioSummary } from './portfolio'
import type { FinancialSupabaseClient } from './types'

export type DataHealthDomain =
  | 'accounts'
  | 'cards'
  | 'loans'
  | 'income'
  | 'transfers'
  | 'obligations'
  | 'ledger'
  | 'planning'
  | 'portfolio'
  | 'snapshot'
  | 'security'

export type DataHealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown'

export type DataHealthCheck = {
  id: string
  domain: DataHealthDomain
  status: DataHealthStatus
  title: string
  finding: string
  evidence: string[]
  affectedCount?: number
  actionHref?: string
  requiresUserConfirmation: boolean
}

export type DataHealthReport = {
  score: number
  generatedAt: string
  checks: DataHealthCheck[]
  unknownChecks: DataHealthCheck[]
  criticalCount: number
  warningCount: number
}

type Row = Record<string, unknown>

type ReadResult<T extends Row = Row> =
  | { ok: true; rows: T[] }
  | { ok: false; error: string }

const READ_TABLES = [
  'accounts',
  'plaid_accounts',
  'plaid_connections',
  'credit_cards',
  'income_schedule',
  'quick_entries',
  'plaid_imports',
  'confirmed_ledger_duplicate_resolutions',
  'obligations',
  'obligation_instances',
  'obligation_providers',
  'scheduled_payments',
  'planning_items',
  'ath_movil_emails',
] as const

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function stringValue(value: unknown) {
  return text(value) || ''
}

function numberValue(value: unknown) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function dateOnly(value: unknown) {
  const raw = text(value)
  return raw ? raw.slice(0, 10) : null
}

function daysSince(value: unknown, now = new Date()) {
  const date = dateOnly(value)
  if (!date) return null

  const parsed = new Date(`${date}T00:00:00`)
  if (!Number.isFinite(parsed.getTime())) return null

  return Math.floor((now.getTime() - parsed.getTime()) / 86_400_000)
}

function daysUntil(value: unknown, now = new Date()) {
  const date = dateOnly(value)
  if (!date) return null

  const parsed = new Date(`${date}T00:00:00`)
  if (!Number.isFinite(parsed.getTime())) return null

  return Math.ceil((parsed.getTime() - now.getTime()) / 86_400_000)
}

function normalize(value: unknown) {
  return String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function money(value: unknown) {
  return `$${numberValue(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function hasField(row: Row, field: string) {
  return Object.prototype.hasOwnProperty.call(row, field)
}

function missingValue(row: Row, field: string) {
  return !hasField(row, field) || row[field] === null || row[field] === undefined || row[field] === ''
}

function percent(value: unknown) {
  return `${Math.round(numberValue(value))}%`
}

function statusRank(status: DataHealthStatus) {
  if (status === 'critical') return 4
  if (status === 'warning') return 3
  if (status === 'unknown') return 2
  return 1
}

function check(input: DataHealthCheck): DataHealthCheck {
  return input
}

function unknownCheck({
  id,
  domain,
  title,
  error,
  actionHref,
}: {
  id: string
  domain: DataHealthDomain
  title: string
  error: string
  actionHref?: string
}) {
  return check({
    id,
    domain,
    status: 'unknown',
    title,
    finding: 'The inspector could not verify this through the authenticated read path.',
    evidence: [error],
    actionHref,
    requiresUserConfirmation: false,
  })
}

function isOpenPaymentStatus(value: unknown) {
  const status = stringValue(value).toLowerCase()
  return !['paid', 'confirmed', 'closed', 'cancelled', 'canceled'].includes(
    status
  )
}

function rowIdentity(row: Row) {
  return [row.id, row.name || row.description || row.merchant]
    .filter(Boolean)
    .join(' · ')
}

function groupRows(rows: Row[], keyFor: (row: Row) => string) {
  const groups = new Map<string, Row[]>()

  for (const row of rows) {
    const key = keyFor(row)
    const existing = groups.get(key) || []
    existing.push(row)
    groups.set(key, existing)
  }

  return [...groups.values()].filter((group) => group.length > 1)
}

async function safeSelect<T extends Row = Row>(
  supabase: FinancialSupabaseClient,
  table: string,
  userId: string,
  select = '*'
): Promise<ReadResult<T>> {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq('user_id', userId)

  if (error) {
    return { ok: false, error: `${table}: ${error.message}` }
  }

  return { ok: true, rows: ((data || []) as unknown[]) as T[] }
}

async function safeCall<T>(label: string, fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() }
  } catch (error) {
    return {
      ok: false as const,
      error: `${label}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function buildAccessChecks(
  supabase: FinancialSupabaseClient,
  userId: string
) {
  const checks: DataHealthCheck[] = []
  const denied: string[] = []
  const empty: string[] = []

  for (const table of READ_TABLES) {
    const result = await safeSelect(supabase, table, userId, 'id')
    if (!result.ok) {
      denied.push(result.error)
      continue
    }

    if (result.rows.length === 0) empty.push(table)
  }

  checks.push(
    check({
      id: 'security-authenticated-read-path',
      domain: 'security',
      status: denied.length > 0 ? 'unknown' : 'healthy',
      title: 'Authenticated financial read path',
      finding:
        denied.length > 0
          ? 'Some financial tables could not be verified through the authenticated server read path.'
          : 'The inspector could read the audited financial tables through the authenticated server path.',
      evidence:
        denied.length > 0
          ? denied
          : ['All audited tables returned rows or confirmed empty state.'],
      affectedCount: denied.length,
      requiresUserConfirmation: false,
    })
  )

  if (empty.length > 0) {
    checks.push(
      check({
        id: 'security-empty-readable-tables',
        domain: 'security',
        status: 'warning',
        title: 'Readable tables with no rows',
        finding:
          'Some readable financial tables are empty for this user. That may be expected, but should be confirmed before AI relies on absence.',
        evidence: empty,
        affectedCount: empty.length,
        requiresUserConfirmation: true,
      })
    )
  }

  return checks
}

function buildAccountChecks({
  plaidAccounts,
  plaidConnections,
  manualAccounts,
  plaidImports,
}: {
  plaidAccounts: ReadResult
  plaidConnections: ReadResult
  manualAccounts: ReadResult
  plaidImports: ReadResult
}) {
  const checks: DataHealthCheck[] = []

  if (!plaidAccounts.ok || !plaidConnections.ok) {
    const error = !plaidAccounts.ok
      ? plaidAccounts.error
      : !plaidConnections.ok
        ? plaidConnections.error
        : 'Plaid account inventory is unavailable through this access path.'

    checks.push(
      unknownCheck({
        id: 'accounts-plaid-readable',
        domain: 'accounts',
        title: 'Plaid account inventory',
        error,
        actionHref: '/portfolio#plaid-accounts',
      })
    )
  } else {
    const activeConnectionIds = new Set(
      plaidConnections.rows
        .filter(
          (row) =>
            stringValue(row.status) === 'active' &&
            !row.archived_at &&
            !row.disconnected_at
        )
        .map((row) => stringValue(row.id))
    )
    const activeAccounts = plaidAccounts.rows.filter((row) =>
      activeConnectionIds.has(stringValue(row.connection_id))
    )
    const duplicateGroups = groupRows(plaidAccounts.rows, (row) =>
      [
        normalize(row.institution_name),
        normalize(row.name),
        normalize(row.type),
        normalize(row.subtype),
      ].join('|')
    )
    const activeDuplicateGroups = duplicateGroups.filter(
      (group) =>
        group.filter((row) => activeConnectionIds.has(stringValue(row.connection_id)))
          .length > 1
    )
    const staleConnections = plaidConnections.rows.filter((row) => {
      if (stringValue(row.status) !== 'active') return false
      const days = daysSince(row.last_sync_at)
      return days === null || days > 2 || Boolean(row.last_sync_error)
    })
    const unhealthyConnections = plaidConnections.rows.filter((row) => {
      const status = normalize(row.status)
      const errorSignal = normalize(`${row.last_sync_error || ''} ${row.error || ''}`)
      return (
        status.includes('EXPIRED') ||
        status.includes('RECONNECT') ||
        status.includes('ERROR') ||
        Boolean(row.needs_reconnect) ||
        Boolean(row.last_sync_error) ||
        errorSignal.includes('ITEM_LOGIN_REQUIRED')
      )
    })
    const missingFlags = plaidAccounts.rows.filter(
      (row) =>
        !row.owner_scope ||
        !row.account_status ||
        row.include_in_dashboard === null ||
        row.include_in_dashboard === undefined
    )
    const inactiveOrHiddenAccounts = plaidAccounts.rows.filter((row) => {
      const status = normalize(row.account_status)
      return (
        status.includes('ARCHIVED') ||
        status.includes('INACTIVE') ||
        row.is_hidden === true ||
        row.include_in_dashboard === false
      )
    })
    const accountsWithoutConnection = plaidAccounts.rows.filter(
      (row) => !activeConnectionIds.has(stringValue(row.connection_id))
    )
    const importHealthEvidence = plaidImports.ok
      ? [
          `${plaidImports.rows.length} Plaid import rows`,
          `${plaidImports.rows.filter((row) => row.review_status || row.status).length} rows with review/status metadata`,
        ]
      : [plaidImports.error]

    checks.push(
      check({
        id: 'accounts-active-plaid',
        domain: 'accounts',
        status: activeAccounts.length > 0 ? 'healthy' : 'critical',
        title: 'Active Plaid accounts',
        finding:
          activeAccounts.length > 0
            ? `${activeAccounts.length} active connected accounts are available.`
            : 'No active connected accounts were found.',
        evidence: [
          `${plaidConnections.rows.length} Plaid connections`,
          `${activeConnectionIds.size} active connections`,
          `${activeAccounts.length} active account rows`,
        ],
        affectedCount: activeAccounts.length,
        actionHref: '/portfolio#plaid-accounts',
        requiresUserConfirmation: activeAccounts.length === 0,
      }),
      check({
        id: 'accounts-duplicate-identities',
        domain: 'accounts',
        status:
          activeDuplicateGroups.length > 0
            ? 'critical'
            : duplicateGroups.length > 0
              ? 'warning'
              : 'healthy',
        title: 'Duplicate logical account identities',
        finding:
          duplicateGroups.length > 0
            ? 'Duplicate Plaid account identities exist across connection generations.'
            : 'No duplicate Plaid account identities were found.',
        evidence:
          duplicateGroups.length > 0
            ? duplicateGroups.map(
                (group) =>
                  `${group.length} rows for ${[
                    group[0]?.institution_name,
                    group[0]?.name,
                    group[0]?.type,
                    group[0]?.subtype,
                  ]
                    .filter(Boolean)
                    .join(' / ')}`
              )
            : ['Plaid account logical identity grouping is unique.'],
        affectedCount: duplicateGroups.length,
        actionHref: '/portfolio#plaid-connections',
        requiresUserConfirmation: duplicateGroups.length > 0,
      }),
      check({
        id: 'accounts-stale-balances',
        domain: 'accounts',
        status: staleConnections.length > 0 ? 'warning' : 'healthy',
        title: 'Stale connected balances',
        finding:
          staleConnections.length > 0
            ? 'At least one active Plaid connection has stale or uncertain sync state.'
            : 'Active Plaid connections were synced recently.',
        evidence:
          staleConnections.length > 0
            ? staleConnections.map(
                (row) =>
                  `${row.institution_name || 'Unknown'} last sync ${row.last_sync_at || 'unknown'}`
              )
            : ['No active connection is older than two days.'],
        affectedCount: staleConnections.length,
        actionHref: '/portfolio#plaid-connections',
        requiresUserConfirmation: false,
      }),
      check({
        id: 'plaid-connection-health',
        domain: 'accounts',
        status: unhealthyConnections.length > 0 ? 'critical' : 'healthy',
        title: 'Plaid connection health state',
        finding:
          unhealthyConnections.length > 0
            ? 'One or more Plaid connections appear expired, errored, or in need of reconnect.'
            : 'Plaid connections do not show explicit reconnect/error state.',
        evidence:
          unhealthyConnections.length > 0
            ? unhealthyConnections.map(
                (row) =>
                  `${row.institution_name || 'Unknown'} · status ${row.status || 'unknown'} · last sync ${row.last_sync_at || 'unknown'}`
              )
            : ['No expired/reconnect/error Plaid connection state detected.'],
        affectedCount: unhealthyConnections.length,
        actionHref: '/portfolio#plaid-connections',
        requiresUserConfirmation: unhealthyConnections.length > 0,
      }),
      check({
        id: 'plaid-account-trust-state',
        domain: 'accounts',
        status:
          inactiveOrHiddenAccounts.length > 0 || accountsWithoutConnection.length > 0
            ? 'warning'
            : 'healthy',
        title: 'Plaid account trust state',
        finding:
          inactiveOrHiddenAccounts.length > 0 || accountsWithoutConnection.length > 0
            ? 'Some Plaid accounts are archived, hidden, inactive, excluded, or not tied to an active connection.'
            : 'Plaid account rows are tied to active trusted connection state.',
        evidence: [
          `${inactiveOrHiddenAccounts.length} archived/hidden/inactive/excluded account rows`,
          `${accountsWithoutConnection.length} account rows outside active connections`,
        ],
        affectedCount: inactiveOrHiddenAccounts.length + accountsWithoutConnection.length,
        actionHref: '/portfolio#plaid-accounts',
        requiresUserConfirmation:
          inactiveOrHiddenAccounts.length + accountsWithoutConnection.length > 0,
      }),
      check({
        id: 'plaid-import-health',
        domain: 'accounts',
        status: !plaidImports.ok ? 'unknown' : plaidImports.rows.length > 0 ? 'healthy' : 'warning',
        title: 'Plaid transaction/import health',
        finding: !plaidImports.ok
          ? 'Plaid import rows could not be verified through the authenticated read path.'
          : plaidImports.rows.length > 0
            ? 'Plaid import rows are available for transaction/review health checks.'
            : 'No Plaid import rows were found.',
        evidence: importHealthEvidence,
        affectedCount: plaidImports.ok ? plaidImports.rows.length : undefined,
        actionHref: '/plaid',
        requiresUserConfirmation: plaidImports.ok && plaidImports.rows.length === 0,
      }),
      check({
        id: 'accounts-flags-ownership',
        domain: 'accounts',
        status: missingFlags.length > 0 ? 'warning' : 'healthy',
        title: 'Account visibility and ownership flags',
        finding:
          missingFlags.length > 0
            ? 'Some account rows are missing owner, status, or dashboard inclusion flags.'
            : 'Connected account rows include owner, status, and dashboard inclusion flags.',
        evidence:
          missingFlags.length > 0
            ? missingFlags.map(rowIdentity)
            : ['All connected account rows have key visibility metadata.'],
        affectedCount: missingFlags.length,
        actionHref: '/portfolio#plaid-accounts',
        requiresUserConfirmation: missingFlags.length > 0,
      })
    )
  }

  if (!manualAccounts.ok) {
    checks.push(
      unknownCheck({
        id: 'accounts-manual-readable',
        domain: 'accounts',
        title: 'Manual accounts',
        error: manualAccounts.error,
        actionHref: '/portfolio#manual-accounts',
      })
    )
  } else {
    checks.push(
      check({
        id: 'accounts-manual',
        domain: 'accounts',
        status: manualAccounts.rows.length > 0 ? 'healthy' : 'warning',
        title: 'Manual account coverage',
        finding:
          manualAccounts.rows.length > 0
            ? `${manualAccounts.rows.length} manual accounts are available.`
            : 'No manual accounts were found through the authenticated path.',
        evidence:
          manualAccounts.rows.length > 0
            ? manualAccounts.rows.map(rowIdentity)
            : ['Manual accounts may be genuinely absent or not yet entered.'],
        affectedCount: manualAccounts.rows.length,
        actionHref: '/portfolio#manual-accounts',
        requiresUserConfirmation: manualAccounts.rows.length === 0,
      })
    )
  }

  return checks
}

function buildCardChecks({
  cardsResult,
  creditCards,
}: {
  cardsResult: Awaited<ReturnType<typeof safeCall>>
  creditCards: ReadResult
}) {
  if (!cardsResult.ok) {
    return [
      unknownCheck({
        id: 'cards-summary-readable',
        domain: 'cards',
        title: 'Cards Summary',
        error: cardsResult.error,
        actionHref: '/cards',
      }),
    ]
  }

  const summary = cardsResult.value as Awaited<ReturnType<typeof getCardsSummary>>
  const highUtilization = summary.activeCards.filter(
    (card) => numberValue(card.utilizationPercent) >= 80
  )
  const missingMetadata = summary.activeCards.filter(
    (card) => card.missingDataChecklist.length > 0
  )
  const disconnected = summary.activeCards.filter((card) => !card.isConnected)
  const missingCreditLimit = summary.activeCards.filter(
    (card) => !card.creditLimit || card.creditLimit <= 0
  )
  const missingAvailableCredit = summary.activeCards.filter(
    (card) => card.availableCredit === null || card.availableCredit === undefined
  )
  const missingCurrentBalance = summary.activeCards.filter(
    (card) => card.currentBalance === null || card.currentBalance === undefined
  )
  const rawActiveCards = creditCards.ok
    ? creditCards.rows.filter((row) => row.is_active !== false)
    : []
  const statementBalanceRows = rawActiveCards.filter((row) =>
    missingValue(row, 'statement_balance')
  )
  const statementDateRows = rawActiveCards.filter((row) =>
    missingValue(row, 'statement_date')
  )
  const closedOrArchivedRows = creditCards.ok
    ? creditCards.rows.filter((row) => {
        const signal = normalize(`${row.status || ''} ${row.account_status || ''}`)
        return row.is_active === false || signal.includes('CLOSED') || signal.includes('ARCHIVED')
      })
    : []

  return [
    check({
      id: 'cards-active-coverage',
      domain: 'cards',
      status: summary.activeCards.length > 0 ? 'healthy' : 'critical',
      title: 'Active credit cards',
      finding:
        summary.activeCards.length > 0
          ? `${summary.activeCards.length} active card profiles are available.`
          : 'No active card profiles were found.',
      evidence: [
        `${summary.connectedCards.length} connected cards`,
        `${summary.totalBalance.toLocaleString()} total balance`,
        `${summary.totalAvailableCredit.toLocaleString()} available credit`,
      ],
      affectedCount: summary.activeCards.length,
      actionHref: '/cards',
      requiresUserConfirmation: summary.activeCards.length === 0,
    }),
    check({
      id: 'cards-high-utilization',
      domain: 'cards',
      status: highUtilization.length > 0 ? 'critical' : 'healthy',
      title: 'High credit utilization',
      finding:
        highUtilization.length > 0
          ? 'One or more cards are above 80% utilization.'
          : 'No active card is above 80% utilization.',
      evidence:
        highUtilization.length > 0
          ? highUtilization.map(
              (card) =>
                `${card.displayName}: ${percent(card.utilizationPercent)} utilization`
            )
          : ['Utilization is below the high-risk threshold.'],
      affectedCount: highUtilization.length,
      actionHref: '/cards',
      requiresUserConfirmation: false,
    }),
    check({
      id: 'cards-missing-metadata',
      domain: 'cards',
      status: missingMetadata.length > 0 ? 'warning' : 'healthy',
      title: 'Card APR, due date, and payment metadata',
      finding:
        missingMetadata.length > 0
          ? 'Some active cards are missing APR, due date, payment, owner, or schedule metadata.'
          : 'Active cards have the key strategy metadata needed for debt reasoning.',
      evidence:
        missingMetadata.length > 0
          ? missingMetadata.map(
              (card) =>
                `${card.displayName}: ${card.missingDataChecklist.join(', ')}`
            )
          : ['No missing card strategy metadata detected.'],
      affectedCount: missingMetadata.length,
      actionHref: '/cards',
      requiresUserConfirmation: missingMetadata.length > 0,
    }),
    check({
      id: 'cards-balance-limit-statement-fields',
      domain: 'cards',
      status:
        missingCreditLimit.length > 0 ||
        missingAvailableCredit.length > 0 ||
        missingCurrentBalance.length > 0 ||
        statementBalanceRows.length > 0 ||
        statementDateRows.length > 0
          ? 'warning'
          : 'healthy',
      title: 'Card balances, limits, statements, and lifecycle fields',
      finding:
        'Active cards were checked for credit limit, available credit, current balance, statement balance, statement date, and active/closed/archive state.',
      evidence: [
        `${missingCreditLimit.length} active cards missing credit limit`,
        `${missingAvailableCredit.length} active cards missing available credit`,
        `${missingCurrentBalance.length} active cards missing current balance`,
        `${statementBalanceRows.length} raw active card rows missing statement balance`,
        `${statementDateRows.length} raw active card rows missing statement date`,
        `${closedOrArchivedRows.length} closed/archived/inactive card rows visible in raw card source`,
      ],
      affectedCount:
        missingCreditLimit.length +
        missingAvailableCredit.length +
        missingCurrentBalance.length +
        statementBalanceRows.length +
        statementDateRows.length,
      actionHref: '/cards',
      requiresUserConfirmation:
        missingCreditLimit.length +
          missingAvailableCredit.length +
          missingCurrentBalance.length +
          statementBalanceRows.length +
          statementDateRows.length >
        0,
    }),
    check({
      id: 'cards-manual-connected-links',
      domain: 'cards',
      status: disconnected.length > 0 ? 'warning' : 'healthy',
      title: 'Manual and connected card links',
      finding:
        disconnected.length > 0
          ? 'Some active cards are not linked to connected Plaid accounts.'
          : 'Active card profiles are linked to connected account data.',
      evidence:
        disconnected.length > 0
          ? disconnected.map((card) => card.displayName)
          : ['Cards Summary resolved active card links.'],
      affectedCount: disconnected.length,
      actionHref: '/cards',
      requiresUserConfirmation: disconnected.length > 0,
    }),
  ]
}

function buildLoanChecks({
  liabilities,
  portfolioResult,
}: {
  liabilities: ReadResult
  portfolioResult: Awaited<ReturnType<typeof safeCall>>
}) {
  const loanNames = ['HIPOTECA', 'HONDA', 'TOYOTA']
  const liabilityRows = liabilities.ok ? liabilities.rows : []
  const loanRows = liabilityRows.filter((row) => {
    const signal = normalize(`${row.name || ''} ${row.lender || ''} ${row.liability_type || ''}`)
    return loanNames.some((name) => signal.includes(name))
  })
  const missingFields = loanRows.filter(
    (row) =>
      !row.balance ||
      !row.monthly_payment ||
      !row.due_day ||
      !row.owner ||
      !row.liability_type
  )
  const portfolioLoans =
    portfolioResult.ok &&
    (portfolioResult.value as Awaited<ReturnType<typeof getPortfolioSummary>>).liabilities
      .filter((liability) => liability.liabilityType !== 'credit_card')

  return [
    check({
      id: 'loans-required-loans',
      domain: 'loans',
      status:
        loanRows.length >= 3 || (portfolioLoans !== false && portfolioLoans.length > 0)
          ? 'healthy'
          : 'critical',
      title: 'Mortgage, Honda, and Toyota loan coverage',
      finding:
        loanRows.length >= 3
          ? 'Required loan rows are present in liabilities.'
          : portfolioLoans !== false && portfolioLoans.length > 0
            ? 'Portfolio Summary exposes loan liabilities through the official net worth contract.'
            : 'One or more required loan rows were not found in the available debt contracts.',
      evidence:
        loanRows.length > 0
          ? loanRows.map(rowIdentity)
          : portfolioLoans !== false && portfolioLoans.length > 0
            ? portfolioLoans.map((liability) => liability.name || liability.id)
            : [
                'Expected loan names: Hipoteca, Honda, Toyota.',
                liabilities.ok
                  ? 'Liabilities table was readable.'
                  : 'Raw liabilities table is not part of the actionable Health Center read path.',
              ],
      affectedCount:
        loanRows.length > 0
          ? loanRows.length
          : portfolioLoans === false
            ? 0
            : portfolioLoans.length,
      actionHref: '/portfolio#liabilities',
      requiresUserConfirmation:
        loanRows.length < 3 && !(portfolioLoans !== false && portfolioLoans.length > 0),
    }),
    check({
      id: 'loans-missing-fields',
      domain: 'loans',
      status:
        !liabilities.ok && portfolioLoans !== false && portfolioLoans.length > 0
          ? 'healthy'
          : missingFields.length > 0
            ? 'warning'
            : 'healthy',
      title: 'Loan metadata completeness',
      finding:
        !liabilities.ok && portfolioLoans !== false && portfolioLoans.length > 0
          ? 'Loan completeness is being judged from Portfolio Summary because the raw liabilities table is not an operational Health Center source.'
          : missingFields.length > 0
            ? 'Some loan rows are missing balance, payment, due day, owner, or type fields.'
            : 'Loan rows have core debt metadata.',
      evidence:
        !liabilities.ok && portfolioLoans !== false && portfolioLoans.length > 0
          ? [`${portfolioLoans.length} loan liabilities in Portfolio Summary`]
          : missingFields.length > 0
            ? missingFields.map(rowIdentity)
            : ['No missing loan metadata detected.'],
      affectedCount: missingFields.length,
      actionHref: '/portfolio#liabilities',
      requiresUserConfirmation:
        liabilities.ok ? missingFields.length > 0 : portfolioLoans === false,
    }),
    check({
      id: 'loans-portfolio-inclusion',
      domain: 'portfolio',
      status:
        portfolioResult.ok && portfolioLoans !== false && portfolioLoans.length > 0
          ? 'healthy'
          : 'critical',
      title: 'Loan inclusion in Portfolio/net worth',
      finding:
        portfolioResult.ok && portfolioLoans !== false && portfolioLoans.length > 0
          ? 'Portfolio Summary includes non-card loan liabilities.'
          : 'Portfolio Summary does not expose non-card loan liabilities yet.',
      evidence:
        portfolioResult.ok
          ? [
              `${(portfolioResult.value as Awaited<ReturnType<typeof getPortfolioSummary>>).liabilities.length} total Portfolio liabilities`,
              `${portfolioLoans === false ? 0 : portfolioLoans.length} non-card loan liabilities`,
            ]
          : [portfolioResult.error],
      affectedCount: portfolioLoans === false ? 0 : portfolioLoans.length,
      actionHref: '/portfolio#liabilities',
      requiresUserConfirmation: false,
    }),
  ]
}

function buildIncomeChecks(incomeRows: ReadResult) {
  if (!incomeRows.ok) {
    return [
      unknownCheck({
        id: 'income-schedule-readable',
        domain: 'income',
        title: 'Income schedule',
        error: incomeRows.error,
        actionHref: '/income#expected-income',
      }),
    ]
  }

  const active = incomeRows.rows.filter((row) => row.is_active !== false)
  const staleExpected = active.filter(
    (row) =>
      stringValue(row.status || 'expected') === 'expected' &&
      daysUntil(row.next_expected_date) !== null &&
      Number(daysUntil(row.next_expected_date)) < 0
  )
  const missingDestination = active.filter(
    (row) => !row.destination_account_id || !row.destination_account_source
  )
  const missingOwner = active.filter((row) => !row.owner && !row.owner_scope)
  const missingFrequency = active.filter(
    (row) => !row.cadence && !row.frequency && !row.income_type
  )
  const missingExpectedAmount = active.filter((row) => !row.amount)
  const receivedWithoutSchedule = incomeRows.rows.filter(
    (row) =>
      stringValue(row.status) === 'received' &&
      (!row.name || !row.received_at || !row.amount)
  )
  const estimated = active.filter(
    (row) => row.amount_is_estimated === true || stringValue(row.confidence) !== 'confirmed'
  )
  const duplicateConcepts = groupRows(active, (row) =>
    [
      normalize(row.name),
      dateOnly(row.next_expected_date) || 'unknown-date',
      Math.round(numberValue(row.amount) * 100),
    ].join('|')
  )
  const requiredSignals = ['SORAYA', 'PENSION', 'UNEMPLOYMENT', 'SEVERANCE']
  const missingSignals = requiredSignals.filter(
    (signal) =>
      !active.some((row) =>
        normalize(`${row.name || ''} ${row.category_code || ''} ${row.notes || ''}`).includes(
          signal
        )
      )
  )

  return [
    check({
      id: 'income-active-rows',
      domain: 'income',
      status: active.length > 0 ? 'healthy' : 'critical',
      title: 'Active income rows',
      finding:
        active.length > 0
          ? `${active.length} active income rows are available.`
          : 'No active income rows were found.',
      evidence: active.length > 0 ? active.map(rowIdentity) : ['Income schedule is empty.'],
      affectedCount: active.length,
      actionHref: '/income#expected-income',
      requiresUserConfirmation: active.length === 0,
    }),
    check({
      id: 'income-stale-expected',
      domain: 'income',
      status: staleExpected.length > 0 ? 'warning' : 'healthy',
      title: 'Stale expected income dates',
      finding:
        staleExpected.length > 0
          ? 'Some expected income rows have dates in the past.'
          : 'Expected income dates are not stale.',
      evidence:
        staleExpected.length > 0
          ? staleExpected.map((row) => `${rowIdentity(row)} due ${dateOnly(row.next_expected_date)}`)
          : ['No stale expected income rows detected.'],
      affectedCount: staleExpected.length,
      actionHref: '/income#expected-income',
      requiresUserConfirmation: staleExpected.length > 0,
    }),
    check({
      id: 'income-metadata',
      domain: 'income',
      status:
        missingDestination.length > 0 ||
        estimated.length > 0 ||
        missingSignals.length > 0 ||
        missingOwner.length > 0 ||
        missingFrequency.length > 0 ||
        missingExpectedAmount.length > 0 ||
        receivedWithoutSchedule.length > 0
          ? 'warning'
          : 'healthy',
      title: 'Income metadata and required sources',
      finding:
        missingDestination.length > 0 ||
        estimated.length > 0 ||
        missingSignals.length > 0 ||
        missingOwner.length > 0 ||
        missingFrequency.length > 0 ||
        missingExpectedAmount.length > 0 ||
        receivedWithoutSchedule.length > 0
          ? 'Income rows need destination, confidence, or required-source review.'
          : 'Income rows include destinations and confirmed metadata.',
      evidence: [
        `${missingOwner.length} rows missing owner/owner scope`,
        `${missingFrequency.length} rows missing frequency/cadence`,
        `${missingExpectedAmount.length} active rows missing expected amount`,
        `${receivedWithoutSchedule.length} received rows missing received amount/date/name signals`,
        `${missingDestination.length} rows missing destination account`,
        `${estimated.length} rows estimated or not confirmed`,
        missingSignals.length > 0
          ? `Missing signals: ${missingSignals.join(', ')}`
          : 'Pension/unemployment/severance signals are represented.',
        `${duplicateConcepts.length} duplicate income concept groups`,
      ],
      affectedCount:
        missingDestination.length +
        estimated.length +
        missingSignals.length +
        duplicateConcepts.length +
        missingOwner.length +
        missingFrequency.length +
        missingExpectedAmount.length +
        receivedWithoutSchedule.length,
      actionHref: '/income#expected-income',
      requiresUserConfirmation: true,
    }),
  ]
}

function buildObligationChecks({
  obligations,
  instances,
  scheduledPayments,
}: {
  obligations: ReadResult
  instances: ReadResult
  scheduledPayments: ReadResult
}) {
  if (!obligations.ok || !instances.ok || !scheduledPayments.ok) {
    const error = !obligations.ok
      ? obligations.error
      : !instances.ok
        ? instances.error
        : !scheduledPayments.ok
          ? scheduledPayments.error
          : 'Obligation data is unavailable through this access path.'

    return [
      unknownCheck({
        id: 'obligations-readable',
        domain: 'obligations',
        title: 'Obligations and payment lifecycle data',
        error,
        actionHref: '/timeline#payments',
      }),
    ]
  }

  const active = obligations.rows.filter((row) => row.is_active !== false)
  const openInstances = instances.rows.filter((row) =>
    isOpenPaymentStatus(row.status)
  )
  const missingAmount = [...active, ...openInstances].filter(
    (row) => !row.default_amount && !row.amount_expected && !row.amount
  )
  const missingDates = openInstances.filter(
    (row) => !row.expected_date || !row.effective_due_date
  )
  const duplicateObligations = groupRows(active, (row) =>
    [
      normalize(row.name),
      normalize(row.category_code),
      normalize(row.owner),
      stringValue(row.due_day),
    ].join('|')
  )
  const legacyOverlap = scheduledPayments.rows.filter((row) =>
    active.some((obligation) =>
      normalize(obligation.name) &&
      normalize(row.name).includes(normalize(obligation.name))
    )
  )

  return [
    check({
      id: 'obligations-active',
      domain: 'obligations',
      status: active.length > 0 ? 'healthy' : 'critical',
      title: 'Active obligations',
      finding:
        active.length > 0
          ? `${active.length} active obligations are available.`
          : 'No active obligations were found.',
      evidence: [
        `${instances.rows.length} obligation instances`,
        `${scheduledPayments.rows.length} legacy scheduled payments`,
      ],
      affectedCount: active.length,
      actionHref: '/timeline#payments',
      requiresUserConfirmation: active.length === 0,
    }),
    check({
      id: 'obligations-metadata',
      domain: 'obligations',
      status:
        missingAmount.length > 0 || missingDates.length > 0
          ? 'warning'
          : 'healthy',
      title: 'Obligation amounts and dates',
      finding:
        missingAmount.length > 0 || missingDates.length > 0
          ? 'Some obligation rows or instances are missing amount/date information.'
          : 'Open obligation instances include amount/date information.',
      evidence: [
        `${missingAmount.length} rows missing amount`,
        `${missingDates.length} open instances missing expected/effective dates`,
      ],
      affectedCount: missingAmount.length + missingDates.length,
      actionHref: '/timeline#payments',
      requiresUserConfirmation: missingAmount.length + missingDates.length > 0,
    }),
    check({
      id: 'obligations-duplicates-overlap',
      domain: 'obligations',
      status:
        duplicateObligations.length > 0 || legacyOverlap.length > 0
          ? 'warning'
          : 'healthy',
      title: 'Duplicate obligations and legacy overlap',
      finding:
        duplicateObligations.length > 0 || legacyOverlap.length > 0
          ? 'Potential duplicate obligations or legacy scheduled payment overlap exists.'
          : 'No obvious obligation duplicates or legacy overlap detected.',
      evidence: [
        `${duplicateObligations.length} duplicate active obligation groups`,
        `${legacyOverlap.length} scheduled payments overlap active obligations by name`,
      ],
      affectedCount: duplicateObligations.length + legacyOverlap.length,
      actionHref: '/timeline#payments',
      requiresUserConfirmation: duplicateObligations.length + legacyOverlap.length > 0,
    }),
  ]
}

function buildLedgerChecks(ledgerResult: Awaited<ReturnType<typeof safeCall>>) {
  if (!ledgerResult.ok) {
    return [
      unknownCheck({
        id: 'ledger-summary-readable',
        domain: 'ledger',
        title: 'Official active ledger view',
        error: ledgerResult.error,
        actionHref: '/history',
      }),
    ]
  }

  const summary = ledgerResult.value as Awaited<ReturnType<typeof getLedgerSummary>>
  const conflicts = getResolvedDuplicateCategoryConflicts(summary)
  const missingAccountName = summary.confirmedLedgerEntries.filter(
    (entry) => !entry.metadata.accountName
  )
  const unresolvedDuplicateGroups = summary.confirmedLedgerDuplicateGroups
  const uncategorized = summary.ledgerReviewCandidates

  return [
    check({
      id: 'ledger-active-summary',
      domain: 'ledger',
      status: summary.confirmedLedgerEntries.length > 0 ? 'healthy' : 'critical',
      title: 'Official active confirmed ledger',
      finding:
        summary.confirmedLedgerEntries.length > 0
          ? `${summary.confirmedLedgerEntries.length} active confirmed ledger entries are included.`
          : 'No active confirmed ledger entries were found.',
      evidence: [
        `${summary.allConfirmedLedgerEntries.length} total confirmed rows`,
        `${summary.duplicateResolvedLedgerEntries.length} duplicate-resolved historical rows`,
        `${money(summary.confirmedLedgerAmount)} official active ledger total`,
      ],
      affectedCount: summary.confirmedLedgerEntries.length,
      actionHref: '/history',
      requiresUserConfirmation: false,
    }),
    check({
      id: 'ledger-unresolved-duplicates',
      domain: 'ledger',
      status: unresolvedDuplicateGroups.length > 0 ? 'warning' : 'healthy',
      title: 'Unresolved duplicate candidate groups',
      finding:
        unresolvedDuplicateGroups.length > 0
          ? 'Confirmed ledger still has unresolved duplicate candidate groups.'
          : 'No unresolved confirmed-ledger duplicate groups detected.',
      evidence:
        unresolvedDuplicateGroups.length > 0
          ? unresolvedDuplicateGroups
              .slice(0, 8)
              .map(
                (group) =>
                  `${group.entries.length} entries · ${group.survivor.description || 'Unknown'} · ${money(group.duplicateAmount)}`
              )
          : ['Duplicate resolution layer has no unresolved groups.'],
      affectedCount: unresolvedDuplicateGroups.length,
      actionHref: '/dev/confirmed-ledger-duplicates',
      requiresUserConfirmation: unresolvedDuplicateGroups.length > 0,
    }),
    check({
      id: 'ledger-category-quality',
      domain: 'ledger',
      status:
        uncategorized.length > 0 || conflicts.length > 0 ? 'warning' : 'healthy',
      title: 'Ledger categories and conflicts',
      finding:
        uncategorized.length > 0 || conflicts.length > 0
          ? 'Some active ledger rows need category review or conflict resolution.'
          : 'Active ledger categories are complete and conflict-free.',
      evidence: [
        `${uncategorized.length} uncategorized/Revisar active rows`,
        `${conflicts.length} duplicate-resolution category conflicts`,
      ],
      affectedCount: uncategorized.length + conflicts.length,
      actionHref: '/dev/category-conflicts',
      requiresUserConfirmation: uncategorized.length + conflicts.length > 0,
    }),
    check({
      id: 'ledger-account-linkage',
      domain: 'ledger',
      status: missingAccountName.length > 0 ? 'warning' : 'healthy',
      title: 'Ledger account linkage',
      finding:
        missingAccountName.length > 0
          ? 'Some active confirmed ledger entries are missing account identity metadata.'
          : 'Active ledger entries include account identity metadata.',
      evidence: [
        `${missingAccountName.length} active ledger rows missing account name metadata`,
      ],
      affectedCount: missingAccountName.length,
      actionHref: '/history',
      requiresUserConfirmation: false,
    }),
  ]
}

function buildTransferChecks({
  athRows,
  quickEntries,
}: {
  athRows: ReadResult
  quickEntries: ReadResult
}) {
  if (!athRows.ok || !quickEntries.ok) {
    const error = !athRows.ok
      ? athRows.error
      : !quickEntries.ok
        ? quickEntries.error
        : 'Transfer and ATH data is unavailable through this access path.'

    return [
      unknownCheck({
        id: 'transfers-readable',
        domain: 'transfers',
        title: 'Transfer and ATH review data',
        error,
        actionHref: '/ath-movil',
      }),
    ]
  }

  const unmatchedAth = athRows.rows.filter(
    (row) =>
      !row.matched_plaid_transaction_id &&
      row.is_ignored !== true &&
      row.exclude_from_spending !== true
  )
  const transferredBetweenCards = athRows.rows.filter((row) =>
    normalize(row.subject).includes('TRANSFERRED BETWEEN CARDS')
  )
  const transferredBetweenCardsNotInternal = transferredBetweenCards.filter(
    (row) => row.is_internal_transfer !== true
  )
  const transferLikeLedgerRows = quickEntries.rows.filter((row) =>
    [
      row.entry_type,
      row.description,
      row.category,
      row.account_name,
    ]
      .map(normalize)
      .join(' ')
      .match(/TRANSFER|ATHM|ATH MOVIL|COOPERATIVA|FIRSTBANK|PAYMENT|PAGO/)
  )
  const coopFirstbank = transferLikeLedgerRows.filter((row) =>
    [row.description, row.account_name, row.category]
      .map(normalize)
      .join(' ')
      .match(/COOPERATIVA|FIRSTBANK/)
  )
  const duplicateTransferGroups = groupRows(transferLikeLedgerRows, (row) =>
    [
      dateOnly(row.entry_date || row.date || row.created_at) || 'unknown-date',
      Math.round(Math.abs(numberValue(row.amount)) * 100),
      normalize(row.description || row.merchant || row.name),
      normalize(row.account_name),
    ].join('|')
  )
  const pendingTransferRows = [...athRows.rows, ...quickEntries.rows].filter((row) =>
    normalize(`${row.status || ''} ${row.review_status || ''} ${row.notes || ''}`).match(
      /PENDING|REVIEW|AMBIGUOUS|UNMATCHED/
    )
  )

  return [
    check({
      id: 'transfers-ath-unmatched',
      domain: 'transfers',
      status: unmatchedAth.length > 0 ? 'warning' : 'healthy',
      title: 'Unmatched ATH email rows',
      finding:
        unmatchedAth.length > 0
          ? 'ATH email rows are not linked to Plaid/ledger transactions.'
          : 'ATH email rows are matched, ignored, or excluded.',
      evidence: [
        `${unmatchedAth.length} unmatched active ATH rows`,
        `${transferredBetweenCards.length} transferred-between-cards email rows`,
      ],
      affectedCount: unmatchedAth.length,
      actionHref: '/ath-movil',
      requiresUserConfirmation: unmatchedAth.length > 0,
    }),
    check({
      id: 'transfers-internal-classification',
      domain: 'transfers',
      status:
        transferredBetweenCardsNotInternal.length > 0 ? 'critical' : 'healthy',
      title: 'Internal transfer classification',
      finding:
        transferredBetweenCardsNotInternal.length > 0
          ? 'Some rows say transferred between cards but are not marked internal.'
          : 'Transferred-between-cards rows are marked internal.',
      evidence:
        transferredBetweenCardsNotInternal.length > 0
          ? transferredBetweenCardsNotInternal.map(
              (row) => `${dateOnly(row.email_date)} · ${row.subject} · ${money(row.amount)}`
            )
          : ['No internal transfer classification mismatch detected.'],
      affectedCount: transferredBetweenCardsNotInternal.length,
      actionHref: '/ath-movil',
      requiresUserConfirmation: transferredBetweenCardsNotInternal.length > 0,
    }),
    check({
      id: 'transfers-ledger-risk',
      domain: 'transfers',
      status: transferLikeLedgerRows.length > 0 ? 'warning' : 'healthy',
      title: 'Transfer-like movements in ledger',
      finding:
        transferLikeLedgerRows.length > 0
          ? 'Transfer-like ledger rows exist and need protection from spending/income double counting.'
          : 'No transfer-like ledger movements were detected.',
      evidence: [
        `${transferLikeLedgerRows.length} transfer-like ledger rows`,
        `${coopFirstbank.length} Cooperativa/FirstBank candidate rows`,
      ],
      affectedCount: transferLikeLedgerRows.length,
      actionHref: '/history',
      requiresUserConfirmation: transferLikeLedgerRows.length > 0,
    }),
    check({
      id: 'transfers-duplicate-pending-ambiguity',
      domain: 'transfers',
      status:
        duplicateTransferGroups.length > 0 || pendingTransferRows.length > 0
          ? 'warning'
          : 'healthy',
      title: 'Transfer duplicate and ambiguity state',
      finding:
        duplicateTransferGroups.length > 0 || pendingTransferRows.length > 0
          ? 'Some transfer-like rows are duplicated, pending, or ambiguous.'
          : 'No duplicate, pending, or ambiguous transfer-like rows were detected.',
      evidence: [
        `${duplicateTransferGroups.length} duplicate transfer-like groups`,
        `${pendingTransferRows.length} pending/review/ambiguous transfer or ATH rows`,
      ],
      affectedCount: duplicateTransferGroups.length + pendingTransferRows.length,
      actionHref: '/history',
      requiresUserConfirmation: duplicateTransferGroups.length + pendingTransferRows.length > 0,
    }),
  ]
}

function buildPlanningChecks({
  planningItems,
  planningResult,
}: {
  planningItems: ReadResult
  planningResult: Awaited<ReturnType<typeof safeCall>>
}) {
  if (!planningItems.ok) {
    return [
      unknownCheck({
        id: 'planning-items-readable',
        domain: 'planning',
        title: 'Planning items',
        error: planningItems.error,
        actionHref: '/planning#funds',
      }),
    ]
  }

  const active = planningItems.rows.filter(
    (row) => row.is_archived !== true && row.is_completed !== true
  )
  const zeroAllocated = active.filter((row) => numberValue(row.current_amount) <= 0)
  const staleDue = active.filter((row) => {
    const days = daysUntil(row.due_date)
    return days !== null && days < 0
  })
  const duplicateConcepts = groupRows(active, (row) =>
    [normalize(row.name), normalize(row.item_type)].join('|')
  )
  const missingIdentity = active.filter(
    (row) => !row.owner && !row.owner_scope && !row.priority && !row.status
  )
  const obligationLike = active.filter((row) =>
    normalize(`${row.name || ''} ${row.item_type || ''}`).match(
      /BILL|PAYMENT|PAGO|COLEGIO|HIPOTECA|HONDA|TOYOTA|OBLIGATION/
    )
  )

  return [
    check({
      id: 'planning-active-items',
      domain: 'planning',
      status: active.length > 0 ? 'healthy' : 'warning',
      title: 'Active planning items',
      finding:
        active.length > 0
          ? `${active.length} active planning items are available.`
          : 'No active planning items were found.',
      evidence: planningResult.ok
        ? [
            `${(planningResult.value as Awaited<ReturnType<typeof getPlanningSummary>>).planningItems.length} items returned by Planning Summary`,
          ]
        : [planningResult.error],
      affectedCount: active.length,
      actionHref: '/planning#funds',
      requiresUserConfirmation: active.length === 0,
    }),
    check({
      id: 'planning-quality',
      domain: 'planning',
      status:
        zeroAllocated.length > 0 ||
        staleDue.length > 0 ||
        duplicateConcepts.length > 0 ||
        obligationLike.length > 0
          ? 'warning'
          : 'healthy',
      title: 'Planning data quality',
      finding:
        'Planning items were checked for zero allocations, stale due dates, duplicates, and obligation-like concepts.',
      evidence: [
        `${zeroAllocated.length} active items with zero allocation`,
        `${staleDue.length} active items with stale due dates`,
        `${duplicateConcepts.length} duplicate concept groups`,
        `${obligationLike.length} items may belong in obligations instead`,
        `${missingIdentity.length} active items missing owner/status/priority signals`,
      ],
      affectedCount:
        zeroAllocated.length +
        staleDue.length +
        duplicateConcepts.length +
        obligationLike.length +
        missingIdentity.length,
      actionHref: '/planning#funds',
      requiresUserConfirmation: true,
    }),
  ]
}

function buildSnapshotReadinessChecks({
  portfolioResult,
  cardsResult,
  ledgerResult,
  planningResult,
  incomeRows,
  plaidConnections,
  athRows,
}: {
  portfolioResult: Awaited<ReturnType<typeof safeCall>>
  cardsResult: Awaited<ReturnType<typeof safeCall>>
  ledgerResult: Awaited<ReturnType<typeof safeCall>>
  planningResult: Awaited<ReturnType<typeof safeCall>>
  incomeRows: ReadResult
  plaidConnections: ReadResult
  athRows: ReadResult
}) {
  const missingSources = [
    portfolioResult.ok ? null : 'Portfolio Summary',
    cardsResult.ok ? null : 'Cards Summary',
    ledgerResult.ok ? null : 'Ledger Summary',
    planningResult.ok ? null : 'Planning Summary',
    incomeRows.ok ? null : 'Income schedule',
    plaidConnections.ok ? null : 'Plaid connections',
    athRows.ok ? null : 'ATH rows',
  ].filter(Boolean) as string[]

  const cardsSummary = cardsResult.ok
    ? (cardsResult.value as Awaited<ReturnType<typeof getCardsSummary>>)
    : null
  const missingCardData = cardsSummary
    ? cardsSummary.activeCards.filter((card) => card.missingDataChecklist.length > 0)
    : []
  const activeIncome = incomeRows.ok
    ? incomeRows.rows.filter((row) => row.is_active !== false)
    : []
  const incomeReady = activeIncome.some(
    (row) => row.amount && row.next_expected_date && (row.owner || row.owner_scope)
  )
  const activePlaidConnections = plaidConnections.ok
    ? plaidConnections.rows.filter((row) => stringValue(row.status) === 'active')
    : []
  const unmatchedAth = athRows.ok
    ? athRows.rows.filter(
        (row) =>
          !row.matched_plaid_transaction_id &&
          row.is_ignored !== true &&
          row.exclude_from_spending !== true
      )
    : []

  return [
    check({
      id: 'snapshot-robototina-readiness',
      domain: 'snapshot',
      status:
        missingSources.length > 0 ||
        missingCardData.length > 0 ||
        !incomeReady ||
        activePlaidConnections.length === 0 ||
        unmatchedAth.length > 0
          ? 'warning'
          : 'healthy',
      title: 'Snapshot readiness for Robototina explanations',
      finding:
        'The inspector checked whether core sources have enough structured metadata for Robototina to explain recommendations without guessing.',
      evidence: [
        missingSources.length > 0
          ? `Unavailable sources: ${missingSources.join(', ')}`
          : 'Core summary sources are readable.',
        `${missingCardData.length} active cards with missing strategy metadata`,
        incomeReady
          ? 'At least one active income row has amount/date/owner metadata.'
          : 'No active income row has complete amount/date/owner metadata.',
        `${activePlaidConnections.length} active Plaid connections`,
        `${unmatchedAth.length} unmatched active ATH rows`,
      ],
      affectedCount:
        missingSources.length +
        missingCardData.length +
        (incomeReady ? 0 : 1) +
        (activePlaidConnections.length === 0 ? 1 : 0) +
        unmatchedAth.length,
      actionHref: '/dev/data-health',
      requiresUserConfirmation: true,
    }),
  ]
}

function buildPortfolioChecks(portfolioResult: Awaited<ReturnType<typeof safeCall>>) {
  if (!portfolioResult.ok) {
    return [
      unknownCheck({
        id: 'portfolio-summary-readable',
        domain: 'portfolio',
        title: 'Portfolio Summary',
        error: portfolioResult.error,
        actionHref: '/portfolio',
      }),
    ]
  }

  const portfolio = portfolioResult.value as Awaited<ReturnType<typeof getPortfolioSummary>>
  const staleManual = portfolio.manualAssets.filter(
    (asset) => !asset.metadata.updated_at && !asset.metadata.created_at
  )
  const hiddenIncluded = portfolio.assets.filter(
    (asset) =>
      asset.metadata.account_status === 'hidden' ||
      asset.metadata.is_hidden === true ||
      asset.metadata.include_in_dashboard === false
  )

  return [
    check({
      id: 'portfolio-core-summary',
      domain: 'portfolio',
      status: portfolio.assets.length > 0 ? 'healthy' : 'critical',
      title: 'Portfolio assets and net worth',
      finding:
        portfolio.assets.length > 0
          ? 'Portfolio Summary is producing assets, liabilities, and net worth.'
          : 'Portfolio Summary has no assets.',
      evidence: [
        `${portfolio.assets.length} assets`,
        `${portfolio.liabilities.length} liabilities`,
        `${money(portfolio.netWorth)} net worth`,
        `${money(portfolio.totalLiquidAvailable)} liquid available`,
      ],
      affectedCount: portfolio.assets.length,
      actionHref: '/portfolio#net-worth',
      requiresUserConfirmation: portfolio.assets.length === 0,
    }),
    check({
      id: 'portfolio-inclusion-staleness',
      domain: 'portfolio',
      status: staleManual.length > 0 || hiddenIncluded.length > 0 ? 'warning' : 'healthy',
      title: 'Portfolio inclusion and staleness',
      finding:
        staleManual.length > 0 || hiddenIncluded.length > 0
          ? 'Some portfolio assets may have stale manual balances or questionable inclusion flags.'
          : 'Portfolio assets do not show obvious stale/manual inclusion issues.',
      evidence: [
        `${staleManual.length} manual assets without timestamp metadata`,
        `${hiddenIncluded.length} hidden/excluded-looking assets still included`,
      ],
      affectedCount: staleManual.length + hiddenIncluded.length,
      actionHref: '/portfolio',
      requiresUserConfirmation: staleManual.length + hiddenIncluded.length > 0,
    }),
  ]
}

function scoreFor(checks: DataHealthCheck[]) {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          checks.filter((item) => item.status === 'critical').length * 12 -
          checks.filter((item) => item.status === 'warning').length * 5 -
          checks.filter((item) => item.status === 'unknown').length * 7
      )
    )
  )
}

export async function getDataHealthReport(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<DataHealthReport> {
  const generatedAt = new Date().toISOString()
  const [
    plaidAccounts,
    plaidConnections,
    creditCards,
    manualAccounts,
    plaidImports,
    liabilities,
    incomeRows,
    obligations,
    obligationInstances,
    scheduledPayments,
    quickEntries,
    athRows,
    planningItems,
    portfolioResult,
    cardsResult,
    ledgerResult,
    planningResult,
  ] = await Promise.all([
    safeSelect(supabase, 'plaid_accounts', userId),
    safeSelect(supabase, 'plaid_connections', userId),
    safeSelect(supabase, 'credit_cards', userId),
    safeSelect(supabase, 'accounts', userId),
    safeSelect(supabase, 'plaid_imports', userId),
    safeSelect(supabase, 'liabilities', userId),
    safeSelect(supabase, 'income_schedule', userId),
    safeSelect(supabase, 'obligations', userId),
    safeSelect(supabase, 'obligation_instances', userId),
    safeSelect(supabase, 'scheduled_payments', userId),
    safeSelect(supabase, 'quick_entries', userId),
    safeSelect(supabase, 'ath_movil_emails', userId),
    safeSelect(supabase, 'planning_items', userId),
    safeCall('Portfolio Summary', () => getPortfolioSummary(supabase, userId)),
    safeCall('Cards Summary', () => getCardsSummary(supabase, userId)),
    safeCall('Ledger Summary', () => getLedgerSummary(supabase, userId)),
    safeCall('Planning Summary', () => getPlanningSummary(supabase, userId)),
  ])

  const accessChecks = await buildAccessChecks(supabase, userId)
  const checks = [
    ...accessChecks,
    ...buildAccountChecks({
      plaidAccounts,
      plaidConnections,
      manualAccounts,
      plaidImports,
    }),
    ...buildCardChecks({ cardsResult, creditCards }),
    ...buildLoanChecks({ liabilities, portfolioResult }),
    ...buildIncomeChecks(incomeRows),
    ...buildObligationChecks({
      obligations,
      instances: obligationInstances,
      scheduledPayments,
    }),
    ...buildLedgerChecks(ledgerResult),
    ...buildTransferChecks({ athRows, quickEntries }),
    ...buildPlanningChecks({ planningItems, planningResult }),
    ...buildPortfolioChecks(portfolioResult),
    ...buildSnapshotReadinessChecks({
      portfolioResult,
      cardsResult,
      ledgerResult,
      planningResult,
      incomeRows,
      plaidConnections,
      athRows,
    }),
  ].sort((left, right) => {
    const rank = statusRank(right.status) - statusRank(left.status)
    if (rank !== 0) return rank
    return left.domain.localeCompare(right.domain)
  })

  const unknownChecks = checks.filter((item) => item.status === 'unknown')

  return {
    score: scoreFor(checks),
    generatedAt,
    checks,
    unknownChecks,
    criticalCount: checks.filter((item) => item.status === 'critical').length,
    warningCount: checks.filter((item) => item.status === 'warning').length,
  }
}
