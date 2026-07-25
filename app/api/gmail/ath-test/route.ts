import { NextResponse } from 'next/server'
import { requireInternalToolAccess } from '@/lib/auth/internal-tools'
import { requireHouseholdGmailManager } from '@/lib/auth/require-household-gmail-manager'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET() {
  const { supabase } = await createServerSupabase()
  const internal = await requireInternalToolAccess(supabase, 'gmail_diagnostic')
  if (!internal.ok) return internal.response
  const manager = await requireHouseholdGmailManager(supabase)
  if (!manager.ok) return manager.response

  return NextResponse.json({
    ok: true,
    status: 'Gmail diagnostics are available.',
  })
}
