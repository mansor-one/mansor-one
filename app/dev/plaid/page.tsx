import { createServerSupabase } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/requireUser'
import SyncPlaidAccountsButton from './SyncPlaidAccountsButton'

export const dynamic = 'force-dynamic'

type PlaidAccount = {
  id: string
  connection_id: string | null
  institution_name: string | null
  plaid_account_id: string | null
  name: string | null
  type: string | null
  subtype: string | null
  available_balance: number | null
  current_balance: number | null
  currency: string | null
  updated_at: string | null
}

type PlaidConnectionRow = {
  id: string
  institution_name: string | null
  created_at: string | null
  encrypted_access_token: string | null
  token_iv: string | null
  token_auth_tag: string | null
}

type SafePlaidConnection = {
  id: string
  institution_name: string | null
  created_at: string | null
  has_encrypted_access_token: boolean
  has_token_iv: boolean
  has_token_auth_tag: boolean
}

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export default async function DevPlaidPage() {
  const { supabase } = await createServerSupabase()
  const { user } = await requireUser(supabase)

  const { data: plaidAccounts, error: accountsError } = await supabase
    .from('plaid_accounts')
    .select(
      'id, connection_id, institution_name, plaid_account_id, name, type, subtype, available_balance, current_balance, currency, updated_at'
    )
    .eq('user_id', user.id)
    .order('institution_name', { ascending: true })

  const { data: plaidConnections, error: connectionsError } = await supabase
    .from('plaid_connections')
    .select(
      'id, institution_name, created_at, encrypted_access_token, token_iv, token_auth_tag'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const safeConnections: SafePlaidConnection[] = (
    (plaidConnections || []) as PlaidConnectionRow[]
  ).map((connection) => ({
    id: connection.id,
    institution_name: connection.institution_name,
    created_at: connection.created_at,
    has_encrypted_access_token: Boolean(connection.encrypted_access_token),
    has_token_iv: Boolean(connection.token_iv),
    has_token_auth_tag: Boolean(connection.token_auth_tag),
  }))

  const safeAccounts = (plaidAccounts || []) as PlaidAccount[]

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dev Plaid</h1>
        <p className="text-sm opacity-70">
          Temporary developer tooling for authenticated Plaid account sync.
        </p>
      </div>

      <SyncPlaidAccountsButton />

      <section className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">plaid_accounts</h2>
          <span className="text-sm">{safeAccounts.length} rows</span>
        </div>

        {accountsError && (
          <pre className="border rounded p-3 text-sm overflow-auto text-red-600">
            {accountsError.message}
          </pre>
        )}

        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(safeAccounts)}
        </pre>
      </section>

      <section className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">plaid_connections</h2>
          <span className="text-sm">{safeConnections.length} rows</span>
        </div>

        {connectionsError && (
          <pre className="border rounded p-3 text-sm overflow-auto text-red-600">
            {connectionsError.message}
          </pre>
        )}

        <pre className="border rounded p-3 text-sm overflow-auto">
          {asJson(safeConnections)}
        </pre>
      </section>
    </main>
  )
}
