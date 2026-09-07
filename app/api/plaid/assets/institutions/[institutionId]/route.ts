import { requireApiUser } from '@/lib/auth/requireApiUser'
import { createServerSupabase } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { decodeValidatedPlaidPng } from '@/lib/plaid/logo-proxy'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ institutionId: string }> }) {
  const { institutionId } = await context.params
  const { supabase } = await createServerSupabase()
  const auth = await requireApiUser(supabase)
  if (!auth.ok) return auth.response

  const { data: connection } = await supabase.from('plaid_connections')
    .select('id').eq('user_id', auth.user.id).eq('institution_id', institutionId)
    .is('archived_at', null).limit(1).maybeSingle()
  if (!connection) return new Response(null, { status: 404 })

  const { data: asset } = await getSupabaseAdmin().from('plaid_institution_assets')
    .select('logo_base64, fetched_at').eq('institution_id', institutionId).maybeSingle()
  const bytes = decodeValidatedPlaidPng(asset?.logo_base64)
  if (!bytes) return new Response(null, { status: 404 })

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
