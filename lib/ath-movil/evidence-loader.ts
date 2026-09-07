import type { FinancialSupabaseClient } from '../financial-engine/types.ts'
import { resolveOptionalAthEvidenceRows } from './schema-availability.ts'

export const ATH_EVIDENCE_QUERY_BATCH_SIZE = 100

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

export async function loadAthEvidenceForPlaidImports(
  supabase: FinancialSupabaseClient,
  plaidImportIds: string[]
) {
  const athMatchResults = await Promise.all(
    chunks(plaidImportIds, ATH_EVIDENCE_QUERY_BATCH_SIZE).map((idBatch) =>
      supabase.from('ath_movil_match_candidates')
        .select('id, ath_email_id, plaid_import_id, score, rank, status, reasons')
        .in('plaid_import_id', idBatch)
        .in('status', ['suggested', 'confirmed', 'rejected'])
        .order('rank')
    )
  )
  const athMatches = athMatchResults.flatMap((result) =>
    resolveOptionalAthEvidenceRows(
      result,
      'ath_movil_match_candidates'
    ).rows
  )
  const athEmailIds = [...new Set(athMatches.map((match) => match.ath_email_id))]
  const athEmailResults = await Promise.all(
    chunks(athEmailIds, ATH_EVIDENCE_QUERY_BATCH_SIZE).map((idBatch) =>
      supabase.from('ath_movil_emails')
        .select('id, occurred_at, direction, counterparty_name, counterparty_phone_last4, message, reference')
        .in('id', idBatch)
    )
  )
  const athEmails = athEmailResults.flatMap((result) =>
    resolveOptionalAthEvidenceRows(result, 'ath_movil_emails').rows
  )

  return { athMatches, athEmails }
}
