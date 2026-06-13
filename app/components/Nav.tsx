export default function Nav() {
  return (
    <nav className="flex gap-4 flex-wrap border-b pb-4 mb-6">
      <a href="/">🏠 Dashboard</a>
      <a href="/cashflow">💰 Cash Flow</a>
      <a href="/payment-instances">📌 Pagos del Mes</a>
      <a href="/quick-entry">⚡ Quick Entry</a>
      <a href="/history">📜 Historial</a>
      <a href="/accounts">🏦 Cuentas</a>
      <a href="/cards">💳 Tarjetas</a>
      <a href="/payments">📅 Pagos Base</a>
      <a href="/advisor">🤖 Advisor</a>
      <a href="/priorities">🎯 Prioridades</a>
      <a href="/future-obligations">🔮 Futuro</a>
      <a href="/income">💵 Income</a>
      <a href="/timeline">📅 Timeline</a>
    </nav>
  )
}
