import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import AppShell from '../components/AppShell'
import { resolveOptionalAthEvidenceRows } from '@/lib/ath-movil/schema-availability'
import {
  ATH_REVIEW_PAGE_SIZE, athEmailReviewState, candidateReasons,
  chunkAthReviewIds, matchesAthReviewFilter, parseAthReviewFilter,
  parseAthReviewPage, type AthReviewFilter,
} from '@/lib/ath-movil/review'
import AthGmailActions from './AthGmailActions'
import AthReviewList, { type AthReviewEmail } from './AthReviewList'

export const dynamic = 'force-dynamic'

type SearchParams = { gmail?: string; filter?: string; page?: string }
const filterOptions: Array<{ value: AthReviewFilter; label: string }> = [
  { value: 'exceptions', label: 'Excepciones' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'high-confidence', label: 'Alta confianza' },
  { value: 'ambiguous', label: 'Ambiguos' },
  { value: 'no-match', label: 'Sin coincidencia' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'rejected', label: 'Rechazados' },
  { value: 'internal-transfer', label: 'Transferencias internas' },
  { value: 'sent', label: 'Enviados' },
  { value: 'received', label: 'Recibidos' },
]
function pageHref(filter: AthReviewFilter, page: number) { return `/ath-movil?filter=${filter}&page=${page}` }

export default async function AthMovilPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const filter = parseAthReviewFilter(params.filter)
  const requestedPage = parseAthReviewPage(params.page)
  const { supabase } = await requireUser()
  const emailCount = await supabase.from('ath_movil_emails').select('id', { count: 'exact', head: true })
  const emailsResult = await supabase.from('ath_movil_emails')
    .select('id, subject, counterparty_name, amount, direction, email_date, occurred_at, message, parse_status, is_ignored')
    .order('email_date', { ascending: false })
  const { rows: allEmails } = resolveOptionalAthEvidenceRows(emailsResult, 'ath_movil_emails')
  const candidateResults = await Promise.all(chunkAthReviewIds(allEmails.map((email) => email.id)).map((idBatch) =>
    supabase.from('ath_movil_match_candidates')
      .select('id, ath_email_id, plaid_import_id, score, status, rank, reasons, reviewed_at')
      .in('ath_email_id', idBatch).order('rank')
  ))
  const allCandidates = candidateResults.flatMap((result) => resolveOptionalAthEvidenceRows(result, 'ath_movil_match_candidates').rows)
  const candidatesByEmail = new Map<string, typeof allCandidates>()
  for (const candidate of allCandidates) {
    const list = candidatesByEmail.get(candidate.ath_email_id) || []
    list.push(candidate)
    candidatesByEmail.set(candidate.ath_email_id, list)
  }
  const filteredEmails = allEmails.filter((email) => matchesAthReviewFilter(email, candidatesByEmail.get(email.id) || [], filter))
  const totalPages = Math.max(1, Math.ceil(filteredEmails.length / ATH_REVIEW_PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)
  const pageEmails = filteredEmails.slice((page - 1) * ATH_REVIEW_PAGE_SIZE, page * ATH_REVIEW_PAGE_SIZE)
  const pageCandidates = pageEmails.flatMap((email) => candidatesByEmail.get(email.id) || [])
  const plaidIds = [...new Set(pageCandidates.map((candidate) => candidate.plaid_import_id))]
  const plaidResults = await Promise.all(chunkAthReviewIds(plaidIds).map((idBatch) => supabase.from('plaid_imports')
    .select('id, amount, transaction_date, merchant, account_name, account_mask, institution_name').in('id', idBatch)))
  const plaidImports = plaidResults.flatMap((result) => {
    if (result.error) throw result.error
    return result.data || []
  })
  const plaidById = new Map(plaidImports.map((item) => [item.id, item]))
  const emails: AthReviewEmail[] = pageEmails.map((email) => ({
    id: email.id, subject: email.subject, counterpartyName: email.counterparty_name,
    amount: email.amount, direction: email.direction, emailDate: email.email_date,
    occurredAt: email.occurred_at, message: email.message, isIgnored: email.is_ignored,
    state: athEmailReviewState(email, candidatesByEmail.get(email.id) || []),
    candidates: (candidatesByEmail.get(email.id) || []).map((candidate) => {
      const plaid = plaidById.get(candidate.plaid_import_id)
      return {
        id: candidate.id, plaidImportId: candidate.plaid_import_id, score: candidate.score,
        rank: candidate.rank, status: candidate.status, reviewedAt: candidate.reviewed_at,
        reasons: candidateReasons(candidate.reasons), plaid: plaid ? {
          amount: plaid.amount, transactionDate: plaid.transaction_date, merchant: plaid.merchant,
          accountName: plaid.account_name, accountMask: plaid.account_mask, institutionName: plaid.institution_name,
        } : null,
      }
    }),
  }))
  const counts = {
    emails: emailCount.count ?? allEmails.length,
    pending: allCandidates.filter((candidate) => candidate.status === 'suggested').length,
    confirmed: allCandidates.filter((candidate) => candidate.status === 'confirmed').length,
    rejected: allCandidates.filter((candidate) => candidate.status === 'rejected').length,
    parseIssues: allEmails.filter((email) => email.parse_status !== 'parsed' && !email.is_ignored).length,
  }
  return <AppShell header={{ eyebrow: 'Salud de integración', title: 'ATH Móvil', subtitle: 'Diagnóstico de Gmail, parsing y excepciones de evidencia. Notificación no financiera · ignorada y demás evidencias no afectan los totales. La categorización accionable ocurre dentro de Review Queue.' }}>
    <AthGmailActions authorizationStatus={params.gmail} />
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Estado de evidencia ATH">{[
      ['Correos importados', counts.emails], ['Por revisar', counts.pending], ['Confirmados', counts.confirmed],
      ['Rechazados', counts.rejected], ['Parsing incompleto', counts.parseIssues],
    ].map(([label, value]) => <div className="rounded-xl border border-slate-700 bg-[#0d1b35] p-4" key={label}><p className="text-sm text-slate-300">{label}</p><p className="mt-1 text-2xl font-bold text-white">{value}</p></div>)}</section>
    <nav className="mt-5 flex flex-wrap gap-2" aria-label="Filtros de revisión ATH">{filterOptions.map((option) => <Link aria-current={filter === option.value ? 'page' : undefined} className={`rounded-full border px-3 py-2 text-sm font-semibold ${filter === option.value ? 'border-sky-300 bg-sky-400 text-slate-950' : 'border-slate-600 text-slate-200'}`} href={pageHref(option.value, 1)} key={option.value}>{option.label}</Link>)}</nav>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300"><p>{filteredEmails.length} correo(s) · página {page} de {totalPages} · {ATH_REVIEW_PAGE_SIZE} por página</p><div className="flex gap-2">{page > 1 && <Link className="rounded border border-slate-600 px-3 py-2" href={pageHref(filter, page - 1)}>Anterior</Link>}{page < totalPages && <Link className="rounded border border-slate-600 px-3 py-2" href={pageHref(filter, page + 1)}>Siguiente</Link>}</div></div>
    <AthReviewList emails={emails} />
    {totalPages > 1 && <nav className="mt-5 flex items-center justify-center gap-3 text-sm" aria-label="Paginación ATH">{page > 1 && <Link className="rounded border border-slate-600 px-3 py-2" href={pageHref(filter, page - 1)}>← Anterior</Link>}<span className="text-slate-300">{page} / {totalPages}</span>{page < totalPages && <Link className="rounded border border-slate-600 px-3 py-2" href={pageHref(filter, page + 1)}>Siguiente →</Link>}</nav>}
  </AppShell>
}
