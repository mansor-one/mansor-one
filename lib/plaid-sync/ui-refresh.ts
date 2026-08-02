type PlaidSyncRunRefreshState = {
  id: string
  status: string
  completed_at: string | null
}

const TERMINAL_PLAID_SYNC_STATUSES = new Set([
  'completed',
  'partially_completed',
  'failed',
])

export function plaidConnectionRefreshKey(
  run: PlaidSyncRunRefreshState | null
): string | null {
  if (!run || !TERMINAL_PLAID_SYNC_STATUSES.has(run.status)) return null

  return `${run.id}:${run.completed_at ?? run.status}`
}
