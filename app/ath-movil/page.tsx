import { requireUser } from '@/lib/auth/requireUser'
import Nav from '../components/Nav'

export const dynamic = 'force-dynamic'

export default async function AthMovilPage() {
  const { supabase } = await requireUser()

  const { data: emails, error } = await supabase
    .from('ath_movil_emails')
    .select('*')
    .order('email_date', { ascending: false })
    .limit(100)

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">📱 ATH Móvil</h1>
      <Nav />

      {error && (
        <pre className="text-red-500">
          {error.message}
        </pre>
      )}

      <section className="border rounded p-4">
        <h2 className="text-2xl font-bold mb-4">Correos ATH importados</h2>

        <div className="space-y-3">
          {emails?.map((item: any) => (
            <div key={item.id} className="border rounded p-4">
              <strong>{item.counterparty || item.subject}</strong>
              <p>Monto: ${Number(item.amount || 0).toLocaleString()}</p>
              <p>Categoría: {item.suggested_category || 'Revisar'}</p>
              <p>Fecha: {item.email_date || 'N/A'}</p>
              {item.message && <p>Mensaje: {item.message}</p>}
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}