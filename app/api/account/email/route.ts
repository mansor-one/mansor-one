import { NextResponse } from 'next/server'
import { authAccountError, validateEmailChange } from '@/lib/auth/account-security'
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
    const body = await request.json()
    const nextEmail = typeof body.email === 'string'
      ? body.email.trim().toLowerCase()
      : ''
    const validationError = validateEmailChange(auth.user.email || '', nextEmail)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const { data, error } = await supabase.auth.updateUser({ email: nextEmail })
    if (error) {
      const safe = authAccountError(error)
      return NextResponse.json({ error: safe.message }, { status: 400 })
    }
    const appliedImmediately = data.user?.email?.toLowerCase() === nextEmail &&
      !data.user?.new_email
    return NextResponse.json({
      success: true,
      status: appliedImmediately ? 'completed' : 'pending',
      currentEmail: appliedImmediately ? data.user?.email : auth.user.email,
      pendingEmail: appliedImmediately ? null : data.user?.new_email || nextEmail,
      message: appliedImmediately
        ? 'Correo actualizado por Supabase Auth.'
        : 'Revisa el correo actual y el nuevo para completar la confirmación, según la configuración de seguridad del proyecto.',
    })
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Account email update failed', error)
    }
    return NextResponse.json(
      { error: 'No se pudo iniciar el cambio de correo.' },
      { status: 500 }
    )
  }
}
