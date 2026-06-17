import Nav from '../components/Nav'

export default function AdvisorV2() {
  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">
        🤖 Advisor V2
      </h1>

      <Nav />

      <div className="border rounded p-4">
        Próximamente:
        análisis de gastos,
        tendencias,
        deuda,
        presupuesto y forecast.
      </div>
    </main>
  )
}