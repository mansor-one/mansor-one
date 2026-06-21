import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const userSupabase = await createServerSupabase()
    const {
      data: { user },
      error: userError,
    } = await userSupabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data, error } = await supabaseAdmin
      .from('plaid_connections')
      .select('id, institution_name, created_at, user_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('Plaid connections fetch error:', { message: msg })
      return NextResponse.json({ error: 'Could not load connections' }, { status: 500 })
    }

    return NextResponse.json({ connections: data || [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Plaid connections unexpected error:', { message: msg })
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
