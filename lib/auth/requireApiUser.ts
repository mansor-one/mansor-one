import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'

export type ApiAuthResult =
  | {
      ok: true
      user: User
    }
  | {
      ok: false
      response: NextResponse<{ error: string }>
    }

export async function requireApiUser(
  supabase: SupabaseClient
): Promise<ApiAuthResult> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  return {
    ok: true,
    user,
  }
}
