import { requireUser } from '@/lib/auth/requireUser'
import Nav from '../components/Nav'
import ConnectPlaidButton from './ConnectPlaidButton'

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
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">🔗 Conexiones bancarias</h1>

      <Nav />

      <p>
        Conecta una cuenta bancaria con Plaid. La conexión se guardará de forma segura en el servidor.
      </p>

      <ConnectPlaidButton />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold">Conexiones bancarias</h2>
          <span className="text-sm opacity-70">
            {connections?.length ?? 0} conexión(es)
          </span>
        </div>

        {error && (
          <pre className="border rounded p-4 text-red-600">
            {JSON.stringify(error, null, 2)}
          </pre>
        )}

        {!safeConnections || safeConnections.length === 0 ? (
          <div className="border rounded p-4">No hay onexiones bancarias registradas.</div>
        ) : (
          <div className="space-y-4">
            {safeConnections.map((connection: any) => {
              const status = connection.encrypted_access_token ? 'Activo' : 'Pendiente'
              const needsAttention =
                !connection.user_id || connection.institution_name === 'Unknown'

              return (
                <div key={connection.id} className="border rounded p-4 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-xl font-semibold">
                      {connection.institution_name || 'Unknown'}
                    </h3>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                      {status}
                    </span>
                  </div>

                  <p>Usuario asociado: {connection.user_id || 'No registrado'}</p>
                  <p>Creado: {formatDate(connection.created_at)}</p>

                  {needsAttention && (
                    <p className="rounded border border-orange-300 bg-orange-50 p-3 text-orange-700">
                      Alerta: esta conexión requiere revisión porque tiene datos incompletos.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}