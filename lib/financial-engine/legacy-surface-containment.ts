import type { FinancialSupabaseClient } from './types'

export type LegacyManualAccount = {
  id: string
  name: string | null
  account_type: string | null
  currency: string | null
  balance: number | string | null
  is_spendable: boolean | null
}

export type LegacyPlaidAccount = {
  id: string
  name: string | null
  type: string | null
  subtype: string | null
  available_balance: number | string | null
  current_balance: number | string | null
  institution_name: string | null
  updated_at: string | null
}

export type LegacySpendableAccount = {
  id: string
  name: string | null
  balance: number | string | null
}

export type LegacyPaymentInstance = {
  id: string
  name: string | null
  amount: number | string | null
  effective_due_date: string
  status: string | null
  owner: string | null
  notes: string | null
}

export type LegacyLiability = {
  id: string
  name: string | null
  monthly_payment: number | string | null
  due_day: number | string | null
  grace_day: number | string | null
  balance: number | string | null
}

type MerchantRule = {
  merchant_keyword: string | null
  suggested_category: string | null
  default_transaction_type: string | null
  confidence_score: number | string | null
}

export type LegacyAccountsReport = {
  manualAccounts: LegacyManualAccount[]
  plaidAccounts: LegacyPlaidAccount[]
}

export type LegacyPaymentsReport = {
  payments: LegacyPaymentInstance[]
  liabilities: LegacyLiability[]
}

export type ImportPreviewResult = {
  amount: string
  merchant: string
  category: string
  transactionType: string
  confidence: number
}

export async function getLegacyAccountsReport(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<LegacyAccountsReport> {
  const { data: manualData, error: manualError } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (manualError) throw manualError

  const { data: plaidData, error: plaidError } = await supabase
    .from('plaid_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true })

  if (plaidError) throw plaidError

  return {
    manualAccounts: (manualData || []) as LegacyManualAccount[],
    plaidAccounts: (plaidData || []) as LegacyPlaidAccount[],
  }
}

export async function getLegacySpendableAccounts(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<LegacySpendableAccount[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('is_spendable', true)
    .order('name', { ascending: true })

  if (error) throw error

  return (data || []) as LegacySpendableAccount[]
}

export async function getLegacyPaymentsReport(
  supabase: FinancialSupabaseClient,
  userId: string
): Promise<LegacyPaymentsReport> {
  const { data: payments, error: paymentsError } = await supabase
    .from('payment_instances')
    .select('*')
    .eq('user_id', userId)
    .eq('payment_month', 6)
    .eq('payment_year', 2026)
    .order('effective_due_date', { ascending: true })

  if (paymentsError) throw paymentsError

  const { data: liabilities, error: liabilitiesError } = await supabase
    .from('liabilities')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (liabilitiesError) throw liabilitiesError

  return {
    payments: (payments || []) as LegacyPaymentInstance[],
    liabilities: (liabilities || []) as LegacyLiability[],
  }
}

export async function analyzeLegacyImportEmail(
  supabase: FinancialSupabaseClient,
  emailText: string
): Promise<ImportPreviewResult> {
  const lower = emailText.toLowerCase()

  let amount = 'No detectado'
  let category = 'Sin categoría'
  let merchant = 'No detectado'
  let transactionType = 'expense'
  let confidence = 0

  const totalMatch = emailText.match(/total[\s\S]{0,80}?\$([\d,]+\.\d{2})/i)

  if (totalMatch) {
    amount = `$${totalMatch[1]}`
  } else {
    const amountMatch = emailText.match(/\$[\d,]+\.\d{2}/)
    amount = amountMatch ? amountMatch[0] : 'No detectado'
  }

  const { data: rules, error } = await supabase
    .from('merchant_rules')
    .select('*')
    .order('confidence_score', { ascending: false })

  if (error) throw error

  const matchedRule = ((rules || []) as MerchantRule[]).find((rule) =>
    lower.includes(String(rule.merchant_keyword || '').toLowerCase())
  )

  if (matchedRule) {
    merchant = matchedRule.merchant_keyword || 'No detectado'
    category = matchedRule.suggested_category || 'Sin categoría'
    transactionType = matchedRule.default_transaction_type || 'expense'
    confidence = Number(matchedRule.confidence_score || 0)
  }

  return {
    amount,
    merchant,
    category,
    transactionType,
    confidence,
  }
}
