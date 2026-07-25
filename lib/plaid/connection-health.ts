export const PLAID_REPAIRABLE_STATES = [
  'ITEM_LOGIN_REQUIRED',
  'PENDING_DISCONNECT',
  'PENDING_EXPIRATION',
] as const

export type PlaidRepairableState = (typeof PLAID_REPAIRABLE_STATES)[number]
export const PLAID_REPAIR_SYNC_PENDING = 'REPAIR_SYNC_PENDING'

export function plaidRepairableState(
  status: string | null | undefined,
  lastSyncError: string | null | undefined
): PlaidRepairableState | null {
  const signal = `${status || ''} ${lastSyncError || ''}`.toUpperCase()
  return (
    PLAID_REPAIRABLE_STATES.find((state) => signal.includes(state)) || null
  )
}

export function plaidConnectionNeedsRepair(
  status: string | null | undefined,
  lastSyncError: string | null | undefined
) {
  const signal = `${status || ''} ${lastSyncError || ''}`.toUpperCase()
  return (
    plaidRepairableState(status, lastSyncError) !== null ||
    signal.includes(PLAID_REPAIR_SYNC_PENDING)
  )
}

export function plaidRepairMessage(institution: string) {
  const label = institution.toLowerCase().includes('banco popular')
    ? 'Banco Popular'
    : institution
  return `${label} necesita que vuelvas a iniciar sesión porque las credenciales cambiaron.`
}

export function canRepairPlaidConnection({
  authUserId,
  connectionHouseholdId,
  membership,
}: {
  authUserId: string
  connectionHouseholdId: string
  membership:
    | {
        auth_user_id: string | null
        household_id: string | null
        role: string | null
        active: boolean | null
      }
    | null
    | undefined
}) {
  return Boolean(
    membership &&
      membership.auth_user_id === authUserId &&
      membership.household_id === connectionHouseholdId &&
      membership.active === true &&
      ['owner', 'member'].includes(membership.role || '')
  )
}
