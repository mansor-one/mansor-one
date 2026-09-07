import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/requireApiUser'
import { requireMutationOrigin } from '@/lib/security/request-origin'
import { createServerSupabase } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = requireMutationOrigin(request)
  if (originError) return originError
  const { supabase } = await createServerSupabase()
  const auth = await requireApiUser(supabase)
  if (!auth.ok) return auth.response
  const { id } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Sugerencia no encontrada.' }, { status: 404 })
  }
  const body = await request.json() as { action?: unknown; reason?: unknown }
  const action = body.action === 'confirm' || body.action === 'reject' ? body.action : null
  const rejectionReason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 240) : null
  if (!action) return NextResponse.json({ error: 'Decisión inválida.' }, { status: 400 })

  const { data: candidate, error } = await supabase
    .from('ath_movil_match_candidates')
    .select('id, household_id, ath_email_id, plaid_import_id, status')
    .eq('id', id)
    .maybeSingle()
  if (error || !candidate) return NextResponse.json({ error: 'Sugerencia no encontrada.' }, { status: 404 })
  if (candidate.status !== 'suggested') return NextResponse.json({ error: 'Esta sugerencia ya fue revisada.' }, { status: 409 })

  const { data: membership } = await supabase.from('household_members')
    .select('role, active')
    .eq('household_id', candidate.household_id)
    .eq('auth_user_id', auth.user.id)
    .in('role', ['owner', 'member'])
    .eq('active', true)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = getSupabaseAdmin()
  const { error: updateError } = await admin.rpc('decide_ath_movil_candidate', {
    p_candidate_id: candidate.id,
    p_household_id: candidate.household_id,
    p_reviewed_by: auth.user.id,
    p_action: action,
    p_rejection_reason: action === 'reject' ? rejectionReason : null,
  })
  if (updateError) return NextResponse.json({ error: 'No se pudo guardar la decisión.' }, { status: 500 })

  return NextResponse.json({ ok: true, status: action === 'confirm' ? 'confirmed' : 'rejected' })
}
