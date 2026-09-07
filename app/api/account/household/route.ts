import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/requireApiUser'
import { requireMutationOrigin } from '@/lib/security/request-origin'
import { createServerSupabase } from '@/lib/supabase/server'

function householdName(value: unknown) {
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
    const name = householdName(body.name)
    if (!name) {
      return NextResponse.json(
        { error: 'Escribe un nombre de 2 a 80 caracteres.' },
        { status: 400 }
      )
    }

    const { data: membership, error: membershipError } = await supabase
      .from('household_members')
      .select('household_id, role, active')
      .eq('auth_user_id', auth.user.id)
      .eq('active', true)
      .maybeSingle()
    if (membershipError) throw membershipError
    if (!membership || !['owner', 'member'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'No tienes permiso para cambiar el nombre del hogar.' },
        { status: 403 }
      )
    }

    const { data, error } = await supabase
      .from('households')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', membership.household_id)
      .select('name')
      .maybeSingle()
    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Hogar no encontrado.' }, { status: 404 })
    }
    return NextResponse.json({ name: data.name })
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Household name update failed', error)
    }
    return NextResponse.json(
      { error: 'No se pudo guardar el nombre del hogar.' },
      { status: 500 }
    )
  }
}
