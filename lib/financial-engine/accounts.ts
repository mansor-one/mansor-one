import type {
  ConnectedAccount,
  CreditCard,
  FinancialSupabaseClient,
  ManualAccount,
} from './types'

export async function getConnectedAccounts(
  supabase: FinancialSupabaseClient,
  userId: string
) {
  const { data: connections, error: connectionsError } = await supabase
    .from('plaid_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('archived_at', null)
    .is('disconnected_at', null)

  if (connectionsError) throw connectionsError

  const activeConnectionIds = (connections || [])
    .map((connection) => connection.id)
    .filter(Boolean)

  if (activeConnectionIds.length === 0) return [] as ConnectedAccount[]

  const { data, error } = await supabase
    .from('plaid_accounts')
    .select('*')
    .eq('user_id', userId)
    .in('connection_id', activeConnectionIds)
    .neq('account_status', 'archived')
    .eq('is_hidden', false)
    .eq('include_in_dashboard', true)

  if (error) throw error

  return (data || []) as ConnectedAccount[]
}

export async function getManualAccounts(
  supabase: FinancialSupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .neq('account_status', 'archived')
    .eq('is_hidden', false)

  if (error) throw error

  return (data || []) as ManualAccount[]
}

export async function getCreditCards(
  supabase: FinancialSupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from('credit_cards')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('balance', { ascending: false })

  if (error) throw error

  return (data || []) as CreditCard[]
}
