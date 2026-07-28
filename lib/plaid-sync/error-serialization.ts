export type PlaidSyncErrorStage =
  | 'accounts'
  | 'liabilities'
  | 'transactions'
  | 'reconciliation'
  | 'financial_refresh'

export type PlaidSyncTechnicalError = {
  stage: PlaidSyncErrorStage
  code: string
  message: string
  hint: string | null
}

function safeErrorText(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !value.trim()) return fallback

  return value
    .trim()
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      '[redacted-email]'
    )
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      '[redacted-id]'
    )
    .replace(
      /\b(access_token|link_token|public_token|refresh_token|authorization)\b\s*[:=]\s*\S+/gi,
      '$1=[redacted]'
    )
}

export function serializePlaidSyncError(
  stage: PlaidSyncErrorStage,
  error: unknown
): PlaidSyncTechnicalError {
  const candidate =
    error && typeof error === 'object'
      ? (error as {
          code?: unknown
          message?: unknown
          hint?: unknown
        })
      : null

  return {
    stage,
    code: safeErrorText(candidate?.code, 'SYNC_STEP_FAILED'),
    message: safeErrorText(
      candidate?.message ??
        (error instanceof Error ? error.message : null),
      'Synchronization step failed'
    ),
    hint:
      typeof candidate?.hint === 'string' && candidate.hint.trim()
        ? safeErrorText(candidate.hint, 'Additional guidance unavailable')
        : null,
  }
}
