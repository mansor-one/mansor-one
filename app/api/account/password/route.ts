import { NextResponse } from 'next/server'
import { authAccountError, validatePasswordChange } from '@/lib/auth/account-security'
import { requireApiUser } from '@/lib/auth/requireApiUser'
import { requireMutationOrigin } from '@/lib/security/request-origin'
import { createServerSupabase } from '@/lib/supabase/server'

function value(input: unknown) {
  return typeof input === 'string' ? input : ''
}

export async function POST(request: Request) {
  const originError = requireMutationOrigin(request)
  if (originError) return originError

  try {
    const { supabase } = await createServerSupabase()
    const auth = await requireApiUser(supabase)
    if (!auth.ok) return auth.response
    const body = await request.json()
    const currentPassword = value(body.currentPassword)
    const newPassword = value(body.newPassword)
    const confirmPassword = value(body.confirmPassword)
    const nonce = value(body.nonce).trim()
    const errors = validatePasswordChange({
      currentPassword,
      newPassword,
      confirmPassword,
    })
    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        { error: 'Revisa los campos de contraseña.', fieldErrors: errors },
        { status: 400 }
      )
    }

    const { error } = await supabase.auth.updateUser({
      current_password: currentPassword,
      password: newPassword,
      ...(nonce ? { nonce } : {}),
    })
    if (error) {
      const safe = authAccountError(error)
      return NextResponse.json(
        { error: safe.message, code: safe.code },
        { status: safe.code === 'reauthentication_required' ? 409 : 400 }
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Account password update failed', error)
    }
    return NextResponse.json(
      { error: 'No se pudo actualizar la contraseña.' },
      { status: 500 }
    )
  }
}
