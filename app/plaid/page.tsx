import { requireUser } from '@/lib/auth/requireUser'
import type { Metadata } from 'next'
import Nav from '../components/Nav'
import ConnectPlaidButton from './ConnectPlaidButton'

export const metadata: Metadata = {
  title: 'Bancos conectados | Mansor One',
}

type PlaidConnection = {
  id: string
  institution_name: string | null
  created_at: string | null
  user_id: string | null
  encrypted_access_token: string | null
}

function formatDate(dateString: string | null) {
  if (!dateString) return 'Sin fecha'

  return new Date(dateString).toLocaleString('es-PR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export default async function PlaidPage() {
  const { supabase } = await requireUser()
  const { data: connections, error } = await supabase
    .from('plaid_connections')
    .select('id, institution_name, created_at, user_id, encrypted_access_token')
    .order('created_at', { ascending: false })

  const safeConnections = connections || []

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100 md:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-4">
          <Nav />
          <div className="space-y-2">
            <p className="text-sm text-neutral-400">Conexiones seguras</p>
            <h1 className="text-3xl font-bold md:text-4xl">
              Bancos conectados
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-neutral-400">
              Conecta bancos y tarjetas para mantener balances y movimientos al
              día. Mansor One guarda la conexión de forma segura en el servidor.
            </p>
          </div>
        </header>

        <ConnectPlaidButton />

        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm text-neutral-400">Estado de conexión</p>
              <h2 className="text-2xl font-bold">Instituciones conectadas</h2>
            </div>
            <span className="w-fit rounded border border-neutral-700 bg-neutral-900 px-3 py-1 text-sm text-neutral-300">
              {connections?.length ?? 0} conexión(es)
            </span>
          </div>

        {error && (
          <div className="rounded border border-red-800 bg-red-950/40 p-4 text-sm text-red-100">
            No se pudieron cargar las conexiones bancarias ahora.
          </div>
        )}

        {!safeConnections || safeConnections.length === 0 ? (
          <div className="rounded border border-neutral-800 bg-neutral-900 p-5 text-neutral-300">
            No hay conexiones bancarias registradas.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {(safeConnections as PlaidConnection[]).map((connection) => {
              const status = connection.encrypted_access_token ? 'Activo' : 'Pendiente'
              const statusClasses = connection.encrypted_access_token
                ? 'border-emerald-800 bg-emerald-950/50 text-emerald-100'
                : 'border-amber-800 bg-amber-950/50 text-amber-100'
              const needsAttention =
                !connection.user_id || connection.institution_name === 'Unknown'
              const institution =
                connection.institution_name &&
                connection.institution_name !== 'Unknown'
                  ? connection.institution_name
                  : 'Institución no identificada'

              return (
                <article
                  key={connection.id}
                  className="space-y-4 rounded border border-neutral-800 bg-neutral-900 p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-neutral-500">
                        Institución
                      </p>
                      <h3 className="mt-1 text-xl font-semibold">
                        {institution}
                      </h3>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-sm ${statusClasses}`}
                    >
                      {status}
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
                  </dl>

                  <details className="rounded border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-500">
                    <summary className="cursor-pointer text-neutral-400">
                      Detalles técnicos
                    </summary>
                    <div className="mt-2 space-y-1 break-all">
                      <p>Conexión: {connection.id}</p>
                      <p>Usuario: {connection.user_id || 'No registrado'}</p>
                    </div>
                  </details>

                  {needsAttention && (
                    <p className="rounded border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-100">
                      Esta conexión requiere revisión porque tiene datos
                      incompletos.
                    </p>
                  )}
                </article>
              )
            })}
          </div>
        )}
        </section>
      </div>
    </main>
  )
}
