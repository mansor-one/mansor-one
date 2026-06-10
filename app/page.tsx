import { supabase } from '@/lib/supabase'

export default async function Home() {
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('*')

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">Mansor One</h1>

      <h2 className="text-xl mb-4">Accounts</h2>

      {error && (
        <pre>{JSON.stringify(error, null, 2)}</pre>
      )}

      <ul>
        {accounts?.map((account) => (
          <li key={account.id}>{account.name}</li>
        ))}
      </ul>
    </main>
  )
}
