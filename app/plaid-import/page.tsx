import Nav from '../components/Nav'

export default function PlaidImportPage() {
  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">
        📥 Plaid Import
      </h1>

      <Nav />

      <div className="border rounded p-4">
        Próximamente aquí aparecerán las transacciones
        pendientes de importar desde Plaid.
      </div>
    </main>
  )
}