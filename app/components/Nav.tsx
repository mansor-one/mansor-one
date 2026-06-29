import Link from 'next/link'

export default function Nav() {
  return (
    <nav className="flex gap-4 flex-wrap border-b pb-4 mb-6">
      {/* Production = daily-use pages. Lab/admin/review tools live under /lab. */}
      <Link href="/">🏠 Dashboard</Link>
      <Link href="/robototina">🤖 Robototina</Link>
      <Link href="/spending">📊 Gastos</Link>
      <Link href="/history">📜 Movimientos</Link>
      <Link href="/planning">🎯 Planning</Link>
      <Link href="/timeline">📅 Timeline</Link>
      <Link href="/cards">💳 Tarjetas</Link>
      <Link href="/plaid">🔗 🏦 Bancos conectados</Link>
    </nav>
  )
}
