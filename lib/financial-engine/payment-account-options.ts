export type PaymentAccountOption = {
  id: string
  source: 'plaid_account' | 'manual_account' | 'cash' | 'other'
  institution: string
  name: string
  suffix: string | null
  usableBalance: number | null
  connected: boolean
}

export type PaymentAccountCandidate = {
  id?: string | null
  name?: string | null
  institution_name?: string | null
  display_name?: string | null
  type?: string | null
  subtype?: string | null
  account_type?: string | null
  current_balance?: number | string | null
  available_balance?: number | string | null
  balance?: number | string | null
  account_status?: string | null
  is_hidden?: boolean | null
  is_active?: boolean | null
  is_spendable?: boolean | null
  mask?: string | null
}

function numberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function visibleActive(account: PaymentAccountCandidate) {
  return account.is_active !== false && account.account_status !== 'archived' &&
    account.account_status !== 'hidden' && account.is_hidden !== true
}

export function eligiblePlaidPaymentAccount(account: PaymentAccountCandidate) {
  return Boolean(account.id && visibleActive(account) && account.is_spendable !== false &&
    account.type === 'depository')
}

export function eligibleManualPaymentAccount(account: PaymentAccountCandidate) {
  const type = String(account.account_type || '').toLowerCase()
  return Boolean(account.id && visibleActive(account) && account.is_spendable !== false &&
    ['cash', 'checking', 'savings', 'depository', 'bank'].some((value) => type.includes(value)))
}

export function paymentAccountOptions(
  plaid: PaymentAccountCandidate[],
  manual: PaymentAccountCandidate[]
): PaymentAccountOption[] {
  return [
    ...plaid.filter(eligiblePlaidPaymentAccount).map((account) => ({
      id: String(account.id), source: 'plaid_account' as const,
      institution: account.institution_name || 'Cuenta conectada',
      name: account.display_name || account.name || 'Cuenta', suffix: account.mask || null,
      usableBalance: numberOrNull(account.available_balance ?? account.current_balance), connected: true,
    })),
    ...manual.filter(eligibleManualPaymentAccount).map((account) => ({
      id: String(account.id), source: 'manual_account' as const,
      institution: 'Cuenta manual', name: account.name || 'Cuenta', suffix: account.mask || null,
      usableBalance: numberOrNull(account.balance), connected: false,
    })),
  ]
}

export function strongPaymentAccountSuggestion(input: {
  detectedAccountId?: string | null
  priorAccountIds?: string[]
  configuredAccountId?: string | null
}) {
  if (input.detectedAccountId) {
    return { id: input.detectedAccountId, reason: 'Esta es la cuenta de la transacción detectada.' }
  }
  const prior = (input.priorAccountIds || []).filter(Boolean)
  if (prior.length >= 2 && prior.every((id) => id === prior[0])) {
    return { id: prior[0], reason: `Usaste esta cuenta en los últimos ${prior.length} pagos.` }
  }
  if (input.configuredAccountId) {
    return { id: input.configuredAccountId, reason: 'Es la cuenta habitual configurada para esta obligación.' }
  }
  return null
}
