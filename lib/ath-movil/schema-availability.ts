export const ATH_EVIDENCE_MIGRATION =
  '20260729031323_ath_movil_evidence_candidates.sql'

export const ATH_EVIDENCE_SCHEMA_WARNING =
  `[ATH Evidence] Schema unavailable. Migration ${ATH_EVIDENCE_MIGRATION} has not been applied. Continuing without ATH context.`

export type OptionalAthEvidenceResource =
  | 'ath_movil_match_candidates'
  | 'ath_movil_emails'
  | 'gmail_evidence_sync_state'

type SupabaseErrorLike = {
  code?: unknown
  message?: unknown
  details?: unknown
  hint?: unknown
}

type OptionalQueryResult<T> = {
  data: T[] | null
  error: unknown
}

const MISSING_SCHEMA_CODES = new Set(['PGRST205', '42P01', '42703'])

const ATH_EVIDENCE_COLUMNS = [
  'ath_email_id',
  'plaid_import_id',
  'score_version',
  'evaluated_at',
  'reviewed_at',
  'reviewed_by',
  'rejection_reason',
  'occurred_at',
  'counterparty_name',
  'counterparty_phone_last4',
  'content_fingerprint',
  'gmail_connection_id',
  'parser_version',
  'parse_status',
  'parsed_fields',
  'sync_cursor',
  'last_synced_at',
]

function errorText(error: SupabaseErrorLike) {
  return [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
}

export function isAthEvidenceSchemaUnavailable(
  error: unknown,
  resource: OptionalAthEvidenceResource
) {
  if (!error || typeof error !== 'object') return false

  const candidate = error as SupabaseErrorLike
  const code = typeof candidate.code === 'string' ? candidate.code : ''
  if (!MISSING_SCHEMA_CODES.has(code)) return false

  const text = errorText(candidate)
  if (code === '42703') {
    return (
      text.includes(resource) ||
      ATH_EVIDENCE_COLUMNS.some((column) => text.includes(column))
    )
  }

  return text.includes(resource)
}

export function resolveOptionalAthEvidenceRows<T>(
  result: OptionalQueryResult<T>,
  resource: OptionalAthEvidenceResource
): { rows: T[]; schemaAvailable: boolean } {
  if (!result.error) {
    return { rows: result.data || [], schemaAvailable: true }
  }

  if (!isAthEvidenceSchemaUnavailable(result.error, resource)) {
    throw result.error
  }

  console.warn(ATH_EVIDENCE_SCHEMA_WARNING)
  return { rows: [], schemaAvailable: false }
}
