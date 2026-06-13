import { supabase } from '@/lib/supabase'
import Nav from '../components/Nav'

export default async function AssetsPage() {
  const { data: assets, error } = await supabase
    .from('assets')
    .select('*')
    .eq('is_active', true)
    .order('name')

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">📦 Assets</h1>

      <Nav />

      {error && (
        <pre className="border rounded p-4">
          {JSON.stringify(error, null, 2)}
        </pre>
      )}

      <p>Total assets: {assets?.length || 0}</p>

      <div className="space-y-4">
        {assets?.map((asset) => (
          <div key={asset.id} className="border rounded p-4 space-y-1">
            <h2 className="font-bold text-xl">{asset.name}</h2>

            <p>Tipo: {asset.asset_type}</p>
            <p>Dueño: {asset.owner}</p>

            <p>
              Valor estimado: $
              {Number(asset.estimated_value || 0).toLocaleString()}
            </p>

            {asset.current_mileage && (
              <p>
                Millaje actual:{' '}
                {Number(asset.current_mileage).toLocaleString()}
              </p>
            )}

            {asset.next_service_mileage && (
              <p>
                Próximo mantenimiento:{' '}
                {Number(asset.next_service_mileage).toLocaleString()} millas
              </p>
            )}

            {asset.estimated_service_cost && (
              <p>
                Costo estimado de mantenimiento: $
                {Number(asset.estimated_service_cost).toLocaleString()}
              </p>
            )}

            {asset.service_frequency_miles && (
              <p>
                Frecuencia de servicio:{' '}
                {Number(asset.service_frequency_miles).toLocaleString()} millas
              </p>
            )}

            {asset.notes && <p>Notas: {asset.notes}</p>}
          </div>
        ))}
      </div>
    </main>
  )
}