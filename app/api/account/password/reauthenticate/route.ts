import { NextResponse } from 'next/server'
import { authAccountError } from '@/lib/auth/account-security'
import { requireApiUser } from '@/lib/auth/requireApiUser'
import { requireMutationOrigin } from '@/lib/security/request-origin'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const originError = requireMutationOrigin(request)
  if (originError) return originError

  try {
    const { supabase } = await createServerSupabase()
    const auth = await requireApiUser(supabase)
    if (!auth.ok) return auth.response
    const { error } = await supabase.auth.reauthenticate()
    if (error) {
      const safe = authAccountError(error)
      return NextResponse.json({ error: safe.message }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Account reauthentication failed', error)
    }
    return NextResponse.json(
      { error: 'No se pudo enviar el código de seguridad.' },
      { status: 500 }
    )
  }
}
