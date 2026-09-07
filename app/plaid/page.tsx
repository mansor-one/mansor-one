import { requireUser } from '@/lib/auth/requireUser'
import type { Metadata } from 'next'
import Link from 'next/link'
import AppShell from '../components/AppShell'
import ContextualEntityTarget from '../components/ContextualEntityTarget'
import InstitutionLogo from '../components/InstitutionLogo'
import ConnectPlaidButton from './ConnectPlaidButton'
import PlaidSyncActions from './PlaidSyncActions'
import RepairPlaidConnectionButton from './RepairPlaidConnectionButton'
import {
  PLAID_REPAIR_SYNC_PENDING,
  plaidConnectionNeedsRepair,
  plaidRepairableState,
  plaidRepairMessage,
} from '@/lib/plaid/connection-health'

export const metadata: Metadata = {
  title: 'Bancos conectados | Mansor One',
}

type PlaidConnection = {
  id: string
  institution_name: string | null
  institution_id: string | null
  created_at: string | null
  user_id: string | null
  encrypted_access_token: string | null
  status: string | null
  archived_at: string | null
  archive_reason: string | null
  last_sync_at: string | null
  last_sync_attempt_at: string | null
  last_repair_success_at: string | null
  last_sync_error: string | null
}

type PlaidAccount = {
  id: string
  connection_id: string | null
  plaid_account_id: string | null
  institution_name: string | null
  name: string | null
  type: string | null
  subtype: string | null
  updated_at: string | null
}

function formatDate(dateString: string | null) {
  if (!dateString) return 'Sin fecha'

  return new Date(dateString).toLocaleString('es-PR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function groupValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() || '__null__'
}

function accountGroupKey(account: PlaidAccount) {
  return [
    groupValue(account.institution_name),
    groupValue(account.name),
    groupValue(account.type),
    groupValue(account.subtype),
  ].join('|')
}

function updatedAtTime(account: PlaidAccount) {
  if (!account.updated_at) return 0

  const time = new Date(account.updated_at).getTime()
  return Number.isFinite(time) ? time : 0
}

function includedDashboardAccountIds(accounts: PlaidAccount[]) {
  const groups = new Map<string, PlaidAccount[]>()

  for (const account of accounts) {
    const key = accountGroupKey(account)
    const group = groups.get(key) || []
    group.push(account)
    groups.set(key, group)
  }

  return new Set(
    Array.from(groups.values()).map((group) =>
      group.reduce((newest, account) =>
        updatedAtTime(account) > updatedAtTime(newest) ? account : newest
      ).id
    )
  )
}

function accountTypeLabel(account: PlaidAccount) {
  if (account.type === 'credit') return 'credit'
  if (account.subtype === 'checking') return 'checking'
  if (account.subtype === 'savings') return 'savings'

  return account.subtype || account.type || 'Sin tipo'
}

export default async function PlaidPage({
  searchParams,
}: {
  searchParams?: Promise<{ connectionId?: string; from?: string }>
}) {
  const params = (await searchParams) || {}
  const { supabase, user } = await requireUser()
  const [
    connectionsResult,
    connectionVisualsResult,
    accountsResult,
    syncRunResult,
    successfulRunResult,
  ] = await Promise.all([
    supabase
      .from('plaid_connections')
      .select(
        'id, institution_name, created_at, user_id, encrypted_access_token, status, archived_at, archive_reason, last_sync_at, last_sync_attempt_at, last_repair_success_at, last_sync_error'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    // Visual metadata is optional until the Plaid Logos migration exists.
    // A missing institution_id column must never hide financial connections.
    (async () => {
      try {
        return await supabase
          .from('plaid_connections')
          .select('id, institution_id')
          .eq('user_id', user.id)
      } catch {
        return { data: null }
      }
    })(),
    supabase
      .from('plaid_accounts')
      .select(
        'id, connection_id, plaid_account_id, institution_name, name, type, subtype, updated_at'
      )
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
    supabase.from('plaid_sync_runs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('plaid_sync_runs').select('completed_at').eq('user_id', user.id).eq('status', 'completed').order('completed_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const connections = connectionsResult.data
  const error = connectionsResult.error
  const institutionIdByConnection = new Map(
    (connectionVisualsResult.data || []).map((connection) => [
      connection.id,
      connection.institution_id,
    ])
  )
  const safeConnections = (connections || []).map((connection) => ({
    ...connection,
    institution_id: institutionIdByConnection.get(connection.id) || null,
  })) as PlaidConnection[]
  const safeAccounts = (accountsResult.data || []) as PlaidAccount[]
  const dashboardAccountIds = includedDashboardAccountIds(safeAccounts)
  const accountsByConnection = safeAccounts.reduce((acc, account) => {
    if (!account.connection_id) return acc

    const accounts = acc.get(account.connection_id) || []
    accounts.push(account)
    acc.set(account.connection_id, accounts)

    return acc
  }, new Map<string, PlaidAccount[]>())
  const activeConnections = safeConnections.filter(
    (connection) =>
      connection.status !== 'archived' && connection.archived_at === null
  )
  const archivedConnections = safeConnections.filter(
    (connection) =>
      connection.status === 'archived' || connection.archived_at !== null
  )
  const requestedConnectionId = params.connectionId || null
  const targetedConnection = requestedConnectionId
    ? safeConnections.find((connection) => connection.id === requestedConnectionId) || null
    : null
  const invalidTarget = Boolean(requestedConnectionId && !targetedConnection)
  const renderConnectionCard = (
    connection: PlaidConnection,
    archived = false
  ) => {
    const status = archived
      ? 'Archived'
      : connection.status === 'revoked' || !connection.encrypted_access_token
        ? 'Revoked'
        : 'Active'
    const statusClasses = archived
      ? 'border-neutral-700 bg-neutral-950 text-neutral-300'
      : status === 'Active'
        ? 'border-emerald-800 bg-emerald-950/50 text-emerald-100'
        : 'border-red-800 bg-red-950/50 text-red-100'
    const needsAttention =
      !archived &&
      (!connection.user_id || connection.institution_name === 'Unknown')
    const institution =
      connection.institution_name &&
      connection.institution_name !== 'Unknown'
        ? connection.institution_name
        : 'Institución no identificada'
    const connectionAccounts = accountsByConnection.get(connection.id) || []
    const successfulSync = connection.last_sync_at
    const repairState = plaidRepairableState(
      connection.status,
      connection.last_sync_error
    )
    const needsRepair =
      !archived &&
      plaidConnectionNeedsRepair(
        connection.status,
        connection.last_sync_error
      )
    const repairSyncPending = `${connection.status || ''} ${
      connection.last_sync_error || ''
    }`
      .toUpperCase()
      .includes(PLAID_REPAIR_SYNC_PENDING)
    const needsLiabilitiesConsent = String(
      connection.last_sync_error || ''
    ).includes('ADDITIONAL_CONSENT_REQUIRED:PRODUCT_LIABILITIES')
    const displayStatus = needsLiabilitiesConsent && !needsRepair
      ? 'Autorización adicional'
      : needsRepair
        ? 'Requiere atención'
        : status
    const displayStatusClasses = needsRepair || needsLiabilitiesConsent
      ? 'border-amber-700 bg-amber-950/50 text-amber-100'
      : statusClasses

    const targeted = targetedConnection?.id === connection.id
    return (
      <ContextualEntityTarget active={targeted} entityId={connection.id} key={connection.id} label="Conexión seleccionada desde Pagos">
      <article
        className={`space-y-4 rounded border p-5 shadow-sm ${
          archived
            ? 'border-neutral-800 bg-neutral-950/60'
            : 'border-neutral-800 bg-neutral-900'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <InstitutionLogo institution={institution} institutionId={connection.institution_id} />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-normal text-neutral-500">
                Institución
              </p>
              <h3 className="mt-1 truncate text-xl font-semibold">
                {institution}
              </h3>
            </div>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-sm ${displayStatusClasses}`}
          >
            {displayStatus}
          </span>
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
            <dt className="text-neutral-500">Conectado</dt>
            <dd className="mt-1 text-neutral-200">
              {formatDate(connection.created_at)}
            </dd>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
            <dt className="text-neutral-500">Perfil</dt>
            <dd className="mt-1 text-neutral-200">
              {connection.user_id ? 'Asociado' : 'Pendiente'}
            </dd>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
            <dt className="text-neutral-500">Cuentas</dt>
            <dd className="mt-1 text-neutral-200">
              {connectionAccounts.length}
            </dd>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
            <dt className="text-neutral-500">Último sync exitoso</dt>
            <dd className="mt-1 text-neutral-200">
              {formatDate(successfulSync)}
            </dd>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
            <dt className="text-neutral-500">Último intento de sync</dt>
            <dd className="mt-1 text-neutral-200">
              {formatDate(connection.last_sync_attempt_at)}
            </dd>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
            <dt className="text-neutral-500">
              Última reparación verificada
            </dt>
            <dd className="mt-1 text-neutral-200">
              {formatDate(connection.last_repair_success_at)}
            </dd>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
            <dt className="text-neutral-500">Error de sync</dt>
            <dd className="mt-1 text-neutral-200">
              {needsRepair
                ? repairSyncPending
                  ? 'La reparación terminó, pero la sincronización necesita otro intento.'
                  : plaidRepairMessage(institution)
                : needsLiabilitiesConsent
                  ? 'Las cuentas y movimientos se actualizaron, pero Plaid requiere autorización adicional para tarjetas y préstamos.'
                : connection.last_sync_error
                  ? 'La conexión requiere atención.'
                  : 'Ninguno'}
            </dd>
          </div>
          {archived && (
            <>
              <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
                <dt className="text-neutral-500">Archivada</dt>
                <dd className="mt-1 text-neutral-200">
                  {formatDate(connection.archived_at)}
                </dd>
              </div>
              <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
                <dt className="text-neutral-500">Razón</dt>
                <dd className="mt-1 text-neutral-200">
                  {connection.archive_reason || 'Sin razón registrada'}
                </dd>
              </div>
            </>
          )}
        </dl>

        <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-neutral-200">
              Cuentas vinculadas
            </p>
            <span className="rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-400">
              {connectionAccounts.length}
            </span>
          </div>

          {connectionAccounts.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">
              No hay cuentas vinculadas a esta conexión.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {connectionAccounts.map((account) => {
                const includedInDashboard = dashboardAccountIds.has(account.id)

                return (
                  <div
                    key={account.id}
                    className="rounded border border-neutral-800 bg-neutral-900/70 p-3"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-100">
                          {account.name || 'Cuenta sin nombre'}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {accountTypeLabel(account)} · Last 4: No guardado
                        </p>
                      </div>
                      <span
                        className={`w-fit rounded-full border px-2 py-1 text-xs ${
                          includedInDashboard
                            ? 'border-emerald-800 bg-emerald-950/50 text-emerald-100'
                            : 'border-neutral-700 bg-neutral-950 text-neutral-400'
                        }`}
                      >
                        {includedInDashboard
                          ? 'Incluida en Dashboard'
                          : 'No incluida en Dashboard'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <details className="rounded border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-500">
          <summary className="cursor-pointer text-neutral-400">
            Detalles técnicos
          </summary>
          <div className="mt-2 space-y-1 break-all">
            <p>Conexión: {connection.id}</p>
            <p>Usuario: {connection.user_id || 'No registrado'}</p>
            <p>Estado: {connection.status || 'active'}</p>
            {repairState && <p>Acción requerida: {repairState}</p>}
          </div>
        </details>

        {needsAttention && (
          <p className="rounded border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-100">
            Esta conexión requiere revisión porque tiene datos incompletos.
          </p>
        )}

        {needsRepair && (
          <RepairPlaidConnectionButton
            connectionId={connection.id}
            institution={institution}
            syncPending={repairSyncPending}
          />
        )}
        {!archived && needsLiabilitiesConsent && !needsRepair && (
          <RepairPlaidConnectionButton
            connectionId={connection.id}
            institution={institution}
            requestLiabilitiesConsent
          />
        )}
      </article>
      </ContextualEntityTarget>
    )
  }

  return (
    <AppShell
      maxWidth="6xl"
      header={{
        eyebrow: 'Conexiones seguras',
        title: 'Bancos',
        subtitle:
          'Conecta bancos y tarjetas para mantener balances y movimientos al día. Mansor One guarda la conexión de forma segura en el servidor.',
      }}
    >
        {params.from === 'timeline' && (
          <Link className="inline-flex rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold" href="/timeline">
            Volver a Pagos
          </Link>
        )}
        {invalidTarget && (
          <p className="rounded border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-100">
            La conexión solicitada no está disponible en este hogar. Mostramos la página normal.
          </p>
        )}
        <ConnectPlaidButton />

        <PlaidSyncActions initialRun={syncRunResult.data ? { ...syncRunResult.data, last_successful_at: successfulRunResult.data?.completed_at || null } : null} connectionNeedsAttention={activeConnections.some((connection) => plaidConnectionNeedsRepair(connection.status, connection.last_sync_error) || !connection.encrypted_access_token)} />

        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm text-neutral-400">Estado de conexión</p>
              <h2 className="text-2xl font-bold">Instituciones conectadas</h2>
            </div>
            <span className="w-fit rounded border border-neutral-700 bg-neutral-900 px-3 py-1 text-sm text-neutral-300">
              {activeConnections.length} activa(s)
            </span>
          </div>

        {error && (
          <div className="rounded border border-red-800 bg-red-950/40 p-4 text-sm text-red-100">
            No se pudieron cargar las conexiones bancarias ahora.
          </div>
        )}

        {safeConnections.length === 0 ? (
          <div className="rounded border border-neutral-800 bg-neutral-900 p-5 text-neutral-300">
            No hay conexiones bancarias registradas.
          </div>
        ) : activeConnections.length === 0 ? (
          <div className="rounded border border-neutral-800 bg-neutral-900 p-5 text-neutral-300">
            No hay conexiones bancarias activas.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {activeConnections.map((connection) =>
              renderConnectionCard(connection)
            )}
          </div>
        )}
        </section>

        {archivedConnections.length > 0 && (
          <section className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm text-neutral-400">Historial preservado</p>
                <h2 className="text-2xl font-bold">Conexiones archivadas</h2>
              </div>
              <span className="w-fit rounded border border-neutral-700 bg-neutral-900 px-3 py-1 text-sm text-neutral-300">
                {archivedConnections.length} archivada(s)
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {archivedConnections.map((connection) =>
                renderConnectionCard(connection, true)
              )}
            </div>
          </section>
        )}
    </AppShell>
  )
}
