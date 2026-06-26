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
  const { data, error } = await supabase
    .from('plaid_accounts')
    .select('*')
    .eq('user_id', userId)

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
