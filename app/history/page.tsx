import { supabase } from '@/lib/supabase'

export default async function HistoryPage() {
  const { data: entries, error } = await supabase
    .from('quick_entries')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">
        📜 Historial
      </h1>

      {error && (
        <pre className="border rounded p-4">
          {JSON.stringify(error, null, 2)}
        </pre>
      )}

      <div className="space-y-4">
        {entries?.map((entry) => (
          <div
            key={entry.id}
            className="border rounded p-4"
          >
            <h2 className="font-bold text-lg">
              {entry.description}
            </h2>

            <p>
              Tipo: {entry.entry_type}
            </p>

            <p>
              Monto: ${Number(entry.amount).toLocaleString()}
            </p>

            <p>
              Dueño: {entry.owner}
            </p>

            <p>
              Fecha:
              {' '}
              {new Date(entry.created_at).toLocaleString(
                'es-PR',
                {
                  timeZone: 'America/Puerto_Rico',
                  dateStyle: 'short',
                  timeStyle: 'short'
                }
              )}
            </p>
          </div>
        ))}
      </div>
    </main>
  )
}
