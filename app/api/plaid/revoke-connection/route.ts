import { requireApiUser } from '@/lib/auth/requireApiUser'
import { revokePlaidConnection } from '@/lib/plaid/revoke-connection'
import { createServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireMutationOrigin } from '@/lib/security/request-origin'

type RevokeRequestBody = {
  connectionId?: unknown
  confirmation?: unknown
  reason?: unknown
}

function stringBodyValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export async function POST(request: Request) {
  try {
    const originError = requireMutationOrigin(request)
    if (originError) return originError
    const { supabase } = await createServerSupabase()
    const auth = await requireApiUser(supabase)
    if (!auth.ok) return auth.response

    const body = (await request.json()) as RevokeRequestBody
    const connectionId = stringBodyValue(body.connectionId)

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId is required' },
        { status: 400 }
      )
    }

    const revokedConnection = await revokePlaidConnection(supabase, {
      connectionId,
      userId: auth.user.id,
      confirmation: stringBodyValue(body.confirmation),
      reason: stringBodyValue(body.reason) || null,
    })

    return NextResponse.json({
      ok: true,
      connection: revokedConnection,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to revoke'

    return NextResponse.json({ error: message }, { status: 400 })
  }
}
