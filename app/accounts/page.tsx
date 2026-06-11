import { supabase } from '@/lib/supabase'

export default async function AccountsPage() {
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })

  const totalBalance =
    accounts?.reduce(
      (sum, account) => sum + Number(account.balance || 0),
      0
    ) || 0

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">🏦 Cuentas</h1>

      {error && (
        <pre className="border border-red-500 rounded p-4">
          {JSON.stringify(error, null, 2)}
        </pre>
      )}

      <section className="border rounded p-4">
        <h2 className="text-xl font-semibold">Balance total</h2>
        <p className="text-3xl font-bold">
          ${totalBalance.toLocaleString()}
        </p>
      </section>

      <section className="space-y-4">
        {accounts?.map((account) => (
          <div key={account.id} className="border rounded p-4">
            <h2 className="text-xl font-semibold">{account.name}</h2>
            <p>Tipo: {account.account_type}</p>
            <p>Balance: ${Number(account.balance || 0).toLocaleString()}</p>
            <p>Moneda: {account.currency}</p>
          </div>
        ))}
      </section>
    </main>
  )
}
