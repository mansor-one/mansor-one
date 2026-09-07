import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/requireApiUser'
import { requireMutationOrigin } from '@/lib/security/request-origin'
import { createServerSupabase } from '@/lib/supabase/server'

function displayName(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized.length >= 2 && normalized.length <= 80 ? normalized : null
}

export async function PATCH(request: Request) {
  const originError = requireMutationOrigin(request)
  if (originError) return originError

  try {
    const { supabase } = await createServerSupabase()
    const auth = await requireApiUser(supabase)
    if (!auth.ok) return auth.response
    const body = await request.json()
    const name = displayName(body.name)
    if (!name) {
      return NextResponse.json(
        { error: 'Escribe un nombre de 2 a 80 caracteres.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('household_members')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('auth_user_id', auth.user.id)
      .eq('active', true)
      .select('name')
      .maybeSingle()
    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Perfil no encontrado.' }, { status: 404 })
    }
    return NextResponse.json({ name: data.name })
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Account profile update failed', error)
    }
    return NextResponse.json(
      { error: 'No se pudo guardar el nombre.' },
      { status: 500 }
    )
  }
}
