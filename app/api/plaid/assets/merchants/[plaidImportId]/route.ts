import { requireApiUser } from '@/lib/auth/requireApiUser'
import { createServerSupabase } from '@/lib/supabase/server'
import { fetchValidatedPlaidLogo } from '@/lib/plaid/logo-proxy'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ plaidImportId: string }> }) {
  const { plaidImportId } = await context.params
  const { supabase } = await createServerSupabase()
  const auth = await requireApiUser(supabase)
  if (!auth.ok) return auth.response

  const { data: imported } = await supabase.from('plaid_imports')
    .select('merchant_logo_url, merchant_entity_id, merchant_logo_source')
    .eq('id', plaidImportId).eq('user_id', auth.user.id).maybeSingle()
  if (!imported?.merchant_entity_id || !imported.merchant_logo_url || !imported.merchant_logo_source) {
    return new Response(null, { status: 404 })
  }

  try {
    const logo = await fetchValidatedPlaidLogo(imported.merchant_logo_url)
    return new Response(logo.bytes, {
      headers: {
        'Content-Type': logo.contentType,
        'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}
