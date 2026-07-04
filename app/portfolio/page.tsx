import { requireUser } from '@/lib/auth/requireUser'
import {
  getPortfolioManagementData,
  getPortfolioSummary,
  manualAccountOwnerOptions,
  manualAccountStatusOptions,
  plaidConnectionStatusOptions,
  type ConnectedAccount,
  type FinancialAsset,
  type ManualAccount,
  type PlaidConnectionSummary,
  type PortfolioPlaidAccount,
  type PortfolioLiability,
} from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import Nav from '../components/Nav'
import {
  revokePlaidConnectionAction,
  updateManualAccountAction,
  updatePlaidAccountAction,
  updatePlaidConnectionAction,
} from './actions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Portfolio | Mansor One',
}

type PortfolioPageProps = {
  searchParams?: Promise<{
    showHidden?: string
    showArchived?: string
    saved?: string
    error?: string
  }>
}

function money(value: unknown) {
  return `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function percent(value: unknown) {
  return `${Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })}%`
}

function accountStatus(account: {
  account_status?: string | null
  is_active?: boolean | null
  is_hidden?: boolean | null
}) {
  if (account.account_status === 'archived' || account.is_active === false) {
    return 'archived'
  }

  if (account.account_status === 'hidden' || account.is_hidden === true) {
    return 'hidden'
  }

  return 'active'
}

function plaidAccountLabel(account: ConnectedAccount) {
  return account.display_name || account.name || 'Plaid account'
}

function connectionStatus(connection: PlaidConnectionSummary) {
  if (connection.status === 'revoked') {
    return 'revoked'
  }

  if (connection.status === 'archived' || connection.archived_at) {
    return 'archived'
  }

  if (connection.status === 'reconnect_needed') {
    return 'reconnect_needed'
  }

  return 'active'
}

function ownerLabel(value: string | null | undefined) {
  return (
    manualAccountOwnerOptions.find((option) => option.value === value)?.label ||
    value ||
    'Household'
  )
}

function historicalConnectionLabel(account: PortfolioPlaidAccount) {
  if (account.connection_disconnected_at) return 'Connection revoked'
  if (account.connection_status === 'revoked') return 'Connection revoked'
  if (account.connection_status === 'archived' || account.connection_archived_at) {
    return 'Connection archived'
  }
  if (account.connection_status === 'reconnect_needed') {
    return 'Connection reconnect needed'
  }

  return 'Connection historical'
}

function ManualAccountCard({
  account,
  allAccounts,
}: {
  account: ManualAccount
  allAccounts: ManualAccount[]
}) {
  const status = accountStatus(account)
  const replacementOptions = allAccounts.filter(
    (option) => option.id && option.id !== account.id
  )

  return (
    <form
      action={updateManualAccountAction}
      className="space-y-3 rounded border border-neutral-800 bg-neutral-900 p-4"
    >
      <input type="hidden" name="accountId" value={account.id || ''} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Manual account
          </p>
          <h3 className="text-lg font-semibold">
            {account.name || 'Unnamed account'}
          </h3>
        </div>
        <span className="w-fit rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
          {status}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Display name</span>
          <input
            name="name"
            defaultValue={account.name || ''}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100"
            required
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Balance</span>
          <input
            name="balance"
            type="number"
            step="0.01"
            defaultValue={String(account.balance ?? 0)}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100"
            required
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Owner</span>
          <select
            name="ownerScope"
            defaultValue={account.owner_scope || 'household'}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100"
          >
            {manualAccountOwnerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Status</span>
          <select
            name="status"
            defaultValue={status}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100"
          >
            {manualAccountStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-neutral-400">Replacement account</span>
          <select
            name="replacementAccountId"
            defaultValue={account.replacement_account_id || ''}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100"
          >
            <option value="">No replacement relationship</option>
            {replacementOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name || 'Unnamed account'} -{' '}
                {ownerLabel(option.owner_scope)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-neutral-400">Archive note</span>
          <input
            name="archiveReason"
            defaultValue={account.archive_reason || ''}
            placeholder="Example: Replaced by FirstBank Soraya"
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          name="isSpendable"
          defaultChecked={account.is_spendable !== false}
          className="size-4"
        />
        Include as spendable manual cash when active and visible
      </label>

      <div className="flex flex-col gap-2 text-xs text-neutral-500 sm:flex-row sm:justify-between">
        <span>Created: {account.created_at || 'Unknown'}</span>
        <span>Updated: {account.updated_at || 'Unknown'}</span>
      </div>

      <button
        type="submit"
        className="rounded border border-emerald-700 bg-emerald-950/50 px-3 py-2 text-sm font-medium text-emerald-100"
      >
        Save account
      </button>
    </form>
  )
}

function HistoricalPlaidAccountCard({
  account,
}: {
  account: PortfolioPlaidAccount
}) {
  return (
    <div className="space-y-3 rounded border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Historical account
          </p>
          <h3 className="text-lg font-semibold">
            {plaidAccountLabel(account)}
          </h3>
          <p className="text-sm text-neutral-400">
            {account.institution_name || 'Unknown institution'} -{' '}
            {account.type || 'type'} / {account.subtype || 'subtype'}
          </p>
        </div>
        <span className="w-fit rounded-full border border-amber-900 px-2 py-1 text-xs text-amber-100">
          Historical account
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-300">
          <p className="text-neutral-400">Connection state</p>
          <p>{historicalConnectionLabel(account)}</p>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-300">
          <p className="text-neutral-400">Balances</p>
          <p>Current {money(account.current_balance)}</p>
          <p>Available {money(account.available_balance)}</p>
        </div>
      </div>

      <div className="rounded border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-300">
        <p>Local history preserved.</p>
        <p>This account is not shown as an active Dashboard account.</p>
      </div>

      <div className="flex flex-col gap-2 text-xs text-neutral-500 sm:flex-row sm:justify-between">
        <span>Original Plaid name: {account.name || 'Unknown'}</span>
        <span>Last account sync: {account.updated_at || 'Unknown'}</span>
      </div>
    </div>
  )
}

function PlaidAccountCard({ account }: { account: ConnectedAccount }) {
  const status = accountStatus(account)

  return (
    <form
      action={updatePlaidAccountAction}
      className="space-y-3 rounded border border-neutral-800 bg-neutral-900 p-4"
    >
      <input type="hidden" name="plaidAccountId" value={account.id || ''} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Plaid account
          </p>
          <h3 className="text-lg font-semibold">
            {plaidAccountLabel(account)}
          </h3>
          <p className="text-sm text-neutral-400">
            {account.institution_name || 'Unknown institution'} -{' '}
            {account.type || 'type'} / {account.subtype || 'subtype'}
          </p>
        </div>
        <span className="w-fit rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
          {status}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Display name</span>
          <input
            name="displayName"
            defaultValue={account.display_name || account.name || ''}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100"
            required
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Owner</span>
          <select
            name="ownerScope"
            defaultValue={account.owner_scope || 'household'}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100"
          >
            {manualAccountOwnerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Status</span>
          <select
            name="status"
            defaultValue={status}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100"
          >
            {manualAccountStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Balances</span>
          <div className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-300">
            <p>Current {money(account.current_balance)}</p>
            <p>Available {money(account.available_balance)}</p>
          </div>
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-neutral-400">Archive note</span>
          <input
            name="archiveReason"
            defaultValue={account.archive_reason || ''}
            placeholder="Example: replaced by new connection"
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          name="includeInDashboard"
          defaultChecked={account.include_in_dashboard !== false}
          className="size-4"
        />
        Include in Dashboard and Portfolio active totals when active
      </label>

      <div className="flex flex-col gap-2 text-xs text-neutral-500 sm:flex-row sm:justify-between">
        <span>Original Plaid name: {account.name || 'Unknown'}</span>
        <span>Last sync: {account.updated_at || 'Unknown'}</span>
      </div>

      <button
        type="submit"
        className="rounded border border-emerald-700 bg-emerald-950/50 px-3 py-2 text-sm font-medium text-emerald-100"
      >
        Save Plaid account
      </button>
    </form>
  )
}

function PlaidConnectionCard({
  connection,
}: {
  connection: PlaidConnectionSummary
}) {
  const status = connectionStatus(connection)
  const canRevoke = status === 'active' || status === 'reconnect_needed'

  return (
    <div className="space-y-3 rounded border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Plaid connection
          </p>
          <h3 className="text-lg font-semibold">
            {connection.institution_name || 'Unknown institution'}
          </h3>
          <p className="text-sm text-neutral-400">
            {connection.linkedAccountsCount} linked accounts
          </p>
        </div>
        <span className="w-fit rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
          {status}
        </span>
      </div>

      <form action={updatePlaidConnectionAction} className="space-y-3">
        <input
          type="hidden"
          name="plaidConnectionId"
          value={connection.id || ''}
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-neutral-400">Connection status</span>
            <select
              name="status"
              defaultValue={status === 'revoked' ? 'archived' : status}
              disabled={status === 'revoked'}
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 disabled:opacity-60"
            >
              {plaidConnectionStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-neutral-400">Last sync attempt</span>
            <div className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-300">
              {connection.last_sync_at || 'Not synced yet'}
            </div>
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="text-neutral-400">Archive/reconnect note</span>
            <input
              name="archiveReason"
              defaultValue={
                connection.archive_reason || connection.last_sync_error || ''
              }
              placeholder="Example: password changed, reconnect needed"
              disabled={status === 'revoked'}
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 disabled:opacity-60"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={status === 'revoked'}
          className="rounded border border-emerald-700 bg-emerald-950/50 px-3 py-2 text-sm font-medium text-emerald-100 disabled:opacity-60"
        >
          Save connection
        </button>
      </form>

      {connection.last_sync_error && (
        <p className="rounded border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-100">
          {connection.last_sync_error}
        </p>
      )}

      <div className="flex flex-col gap-2 text-xs text-neutral-500 sm:flex-row sm:justify-between">
        <span>Created: {connection.created_at || 'Unknown'}</span>
        <span>Status updated: {connection.status_updated_at || 'Unknown'}</span>
      </div>

      {connection.disconnected_at && (
        <p className="text-xs text-neutral-500">
          Disconnected: {connection.disconnected_at}
        </p>
      )}

      {canRevoke && (
        <details className="rounded border border-red-900 bg-red-950/20 p-3">
          <summary className="cursor-pointer text-sm font-medium text-red-100">
            Disconnect / Revoke connection
          </summary>
          <form action={revokePlaidConnectionAction} className="mt-3 space-y-3">
            <input
              type="hidden"
              name="plaidConnectionId"
              value={connection.id || ''}
            />
            <div className="space-y-2 text-sm text-red-100">
              <p>This will revoke the Plaid connection.</p>
              <p>Future syncs will stop.</p>
              <p>Local historical transactions will remain.</p>
              <p>Local accounts/history will not be deleted.</p>
            </div>
            <label className="space-y-1 text-sm">
              <span className="text-neutral-300">Type REVOKE to confirm</span>
              <input
                name="confirmation"
                pattern="REVOKE"
                placeholder="REVOKE"
                className="w-full rounded border border-red-800 bg-neutral-950 px-3 py-2 text-neutral-100"
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-neutral-300">Disconnect reason</span>
              <input
                name="reason"
                placeholder="Example: duplicate or replaced connection"
                className="w-full rounded border border-red-800 bg-neutral-950 px-3 py-2 text-neutral-100"
              />
            </label>
            <button
              type="submit"
              className="rounded border border-red-700 bg-red-950/60 px-3 py-2 text-sm font-medium text-red-100"
            >
              Revoke Plaid connection
            </button>
          </form>
        </details>
      )}
    </div>
  )
}

function RevokedPlaidConnectionCard({
  connection,
}: {
  connection: PlaidConnectionSummary
}) {
  return (
    <div className="space-y-3 rounded border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Revoked Plaid connection
          </p>
          <h3 className="text-lg font-semibold">
            {connection.institution_name || 'Unknown institution'}
          </h3>
          <p className="text-sm text-neutral-400">
            {connection.linkedAccountsCount} linked accounts
          </p>
        </div>
        <span className="w-fit rounded-full border border-red-900 px-2 py-1 text-xs text-red-100">
          revoked
        </span>
      </div>

      <div className="rounded border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-300">
        <p>This connection was disconnected from Plaid.</p>
        <p>Future syncs stopped for this connection.</p>
        <p>Local transaction history and account records remain in Mansor One.</p>
      </div>

      <div className="rounded border border-emerald-900 bg-emerald-950/20 p-3 text-sm text-emerald-100">
        <p className="font-medium">Reconnect guidance</p>
        <p>Reconnect the same institution from Bancos conectados.</p>
        <p>Create a replacement connection for new balances and imports.</p>
        <p>Keep the old history archived; accounts are not merged automatically.</p>
        <Link
          href="/plaid"
          className="mt-3 inline-block rounded border border-emerald-700 px-3 py-2 text-sm font-medium"
        >
          Open Bancos conectados
        </Link>
      </div>

      <div className="flex flex-col gap-2 text-xs text-neutral-500 sm:flex-row sm:justify-between">
        <span>Disconnected: {connection.disconnected_at || 'Unknown'}</span>
        <span>Reason: {connection.archive_reason || 'Not provided'}</span>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string | number
  detail: string
}) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-sm text-neutral-400">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{detail}</p>
    </div>
  )
}

function AssetRow({ asset }: { asset: FinancialAsset }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium">{asset.name || 'Unnamed asset'}</p>
          <p className="text-sm text-neutral-400">
            {asset.institution || asset.source} - {asset.type || 'asset'}
            {asset.subtype ? `/${asset.subtype}` : ''}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="font-bold">{money(asset.balance)}</p>
          <p className="text-xs text-neutral-500">
            Usable:{' '}
            {asset.usableBalance === null
              ? 'N/A'
              : money(asset.usableBalance)}
          </p>
        </div>
      </div>
    </div>
  )
}

function LiabilityRow({ liability }: { liability: PortfolioLiability }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium">{liability.name || 'Unnamed liability'}</p>
          <p className="text-sm text-neutral-400">
            {liability.institution || liability.source} -{' '}
            {liability.liabilityType}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="font-bold">{money(liability.balance)}</p>
          <p className="text-xs text-neutral-500">
            Min:{' '}
            {liability.minimumPayment === null
              ? 'N/A'
              : money(liability.minimumPayment)}
          </p>
        </div>
      </div>
    </div>
  )
}

export default async function PortfolioPage({
  searchParams,
}: PortfolioPageProps) {
  const params = (await searchParams) || {}
  const showHidden = params.showHidden === '1'
  const showArchived = params.showArchived === '1'
  const saved =
    params.saved === 'manual-account' ||
    params.saved === 'plaid-account' ||
    params.saved === 'plaid-connection' ||
    params.saved === 'plaid-connection-revoked'
  const failed =
    params.error === 'manual-account-update' ||
    params.error === 'plaid-account-update' ||
    params.error === 'plaid-connection-update' ||
    params.error === 'plaid-connection-revoke'
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)
  const [portfolio, management] = await Promise.all([
    getPortfolioSummary(supabase, user.id),
    getPortfolioManagementData(supabase, user.id),
  ])

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="space-y-4">
          <div>
            <p className="text-sm text-neutral-400">Portfolio foundation</p>
            <h1 className="text-3xl font-bold md:text-5xl">Portfolio</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
              Central view for cash, manual accounts, connected accounts, debt,
              assets, and net worth. Manual account changes preserve history.
            </p>
          </div>
          <Nav />
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {saved && (
            <div className="rounded border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-100 sm:col-span-2 xl:col-span-4">
              Account saved.
            </div>
          )}
          {failed && (
            <div className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-100 sm:col-span-2 xl:col-span-4">
              Account could not be saved. Check the fields and try again.
            </div>
          )}
          <SummaryCard
            label="Net worth"
            value={money(portfolio.netWorth)}
            detail="Assets minus liabilities"
          />
          <SummaryCard
            label="Cash"
            value={money(portfolio.totalLiquidAvailable)}
            detail="Usable liquid cash"
          />
          <SummaryCard
            label="Assets"
            value={money(portfolio.totalAssetBalance)}
            detail={`${portfolio.totalAssets} tracked assets`}
          />
          <SummaryCard
            label="Liabilities"
            value={money(portfolio.totalLiabilities)}
            detail={`${percent(portfolio.creditUtilizationPercent)} credit utilization`}
          />
        </section>

        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Cash</h2>
              <p className="text-sm text-neutral-400">
                Visible active manual accounts and connected liquid assets.
              </p>
            </div>
            <div className="flex gap-2 text-sm">
              <Link
                href="/portfolio?showHidden=1"
                className="rounded border border-neutral-700 px-3 py-2 text-neutral-300"
              >
                Show hidden
              </Link>
              <Link
                href="/portfolio?showArchived=1"
                className="rounded border border-neutral-700 px-3 py-2 text-neutral-300"
              >
                Show archived
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {portfolio.cashByInstitution.map((item) => (
              <div
                key={item.institution}
                className="rounded border border-neutral-800 bg-neutral-900 p-4"
              >
                <p className="font-medium">{item.institution}</p>
                <p className="mt-2 text-2xl font-bold">
                  {money(item.totalUsable)}
                </p>
                <p className="text-xs text-neutral-500">
                  Balance {money(item.totalBalance)} - {item.count} accounts
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-2xl font-bold">Manual Accounts</h2>
            <p className="text-sm text-neutral-400">
              Edit names, balances, owners, visibility, archive status, and
              replacement relationships without deleting history.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {management.activeManualAccounts.map((account) => (
              <ManualAccountCard
                key={account.id}
                account={account}
                allAccounts={management.manualAccounts}
              />
            ))}
          </div>
          {management.activeManualAccounts.length === 0 && (
            <p className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
              No active visible manual accounts.
            </p>
          )}
        </section>

        {showHidden && (
          <section className="space-y-3">
            <h2 className="text-2xl font-bold">Hidden Manual Accounts</h2>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {management.hiddenManualAccounts.map((account) => (
                <ManualAccountCard
                  key={account.id}
                  account={account}
                  allAccounts={management.manualAccounts}
                />
              ))}
            </div>
          </section>
        )}

        {showArchived && (
          <section className="space-y-3">
            <h2 className="text-2xl font-bold">Archived Manual Accounts</h2>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {management.archivedManualAccounts.map((account) => (
                <ManualAccountCard
                  key={account.id}
                  account={account}
                  allAccounts={management.manualAccounts}
                />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div>
            <h2 className="text-2xl font-bold">Plaid Accounts</h2>
            <p className="text-sm text-neutral-400">
              Local visibility and ownership controls. Plaid history and
              connections are preserved.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {management.activePlaidAccounts.map((account) => (
              <PlaidAccountCard key={account.id} account={account} />
            ))}
          </div>
          {management.activePlaidAccounts.length === 0 && (
            <p className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
              No active visible Plaid accounts.
            </p>
          )}
        </section>

        {management.historicalPlaidAccounts.length > 0 && (
          <section className="space-y-3">
            <div>
              <h2 className="text-2xl font-bold">
                Historical Plaid Accounts
              </h2>
              <p className="text-sm text-neutral-400">
                Accounts from archived, revoked, or disconnected connections.
                Local history is preserved, but these accounts are not active
                Dashboard accounts.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {management.historicalPlaidAccounts.map((account) => (
                <HistoricalPlaidAccountCard
                  key={account.id}
                  account={account}
                />
              ))}
            </div>
          </section>
        )}

        {showHidden && (
          <section className="space-y-3">
            <h2 className="text-2xl font-bold">Hidden Plaid Accounts</h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {management.hiddenPlaidAccounts.map((account) => (
                <PlaidAccountCard key={account.id} account={account} />
              ))}
            </div>
          </section>
        )}

        {showArchived && (
          <section className="space-y-3">
            <h2 className="text-2xl font-bold">Archived Plaid Accounts</h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {management.archivedPlaidAccounts.map((account) => (
                <PlaidAccountCard key={account.id} account={account} />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div>
            <h2 className="text-2xl font-bold">Plaid Connections</h2>
            <p className="text-sm text-neutral-400">
              Local connection state for sync control. Actual Plaid disconnect
              remains separate.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {management.activePlaidConnections.map((connection) => (
              <PlaidConnectionCard
                key={connection.id}
                connection={connection}
              />
            ))}
            {management.reconnectNeededPlaidConnections.map((connection) => (
              <PlaidConnectionCard
                key={connection.id}
                connection={connection}
              />
            ))}
          </div>
          {management.activePlaidConnections.length === 0 &&
            management.reconnectNeededPlaidConnections.length === 0 && (
              <p className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
                No active Plaid connections.
              </p>
            )}
        </section>

        {showArchived && (
          <section className="space-y-3">
            <h2 className="text-2xl font-bold">Archived Plaid Connections</h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {management.archivedPlaidConnections.map((connection) => (
                <PlaidConnectionCard
                  key={connection.id}
                  connection={connection}
                />
              ))}
            </div>
          </section>
        )}

        {management.revokedPlaidConnections.length > 0 && (
          <section className="space-y-3">
            <div>
              <h2 className="text-2xl font-bold">Revoked Plaid Connections</h2>
              <p className="text-sm text-neutral-400">
                Disconnected connections are kept for history and replacement
                planning.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {management.revokedPlaidConnections.map((connection) => (
                <RevokedPlaidConnectionCard
                  key={connection.id}
                  connection={connection}
                />
              ))}
            </div>
          </section>
        )}

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold">Credit Cards</h2>
            <div className="space-y-2">
              {portfolio.liabilities.map((liability) => (
                <LiabilityRow key={liability.id} liability={liability} />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-bold">Loans</h2>
            <div className="space-y-2">
              {management.loans.map((loan) => (
                <div
                  key={loan.id}
                  className="rounded border border-neutral-800 bg-neutral-900 p-3"
                >
                  <p className="font-medium">{loan.name || 'Loan'}</p>
                  <p className="text-sm text-neutral-400">
                    {loan.lender || 'Unknown lender'} -{' '}
                    {loan.owner || 'unknown'}
                  </p>
                  <p className="mt-2 font-bold">{money(loan.balance)}</p>
                  <p className="text-xs text-neutral-500">
                    Payment {money(loan.monthly_payment)} - due day{' '}
                    {loan.due_day || 'N/A'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">Assets</h2>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {portfolio.assets
              .filter((asset) => !asset.isCredit)
              .map((asset) => (
                <AssetRow key={asset.id} asset={asset} />
              ))}
          </div>
        </section>

        <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="text-2xl font-bold">Businesses</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Placeholder for business entities, owner scopes, and future
            business cash/asset reporting.
          </p>
        </section>
      </div>
    </main>
  )
}
