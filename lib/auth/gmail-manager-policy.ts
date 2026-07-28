export function isHouseholdGmailManagerMembership(
  membership:
    | {
        household_id?: string | null
        role?: string | null
        active?: boolean | null
      }
    | null
    | undefined
) {
  return Boolean(
    membership?.household_id &&
      membership.role === 'owner' &&
      membership.active === true
  )
}
