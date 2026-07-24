import { requireApiUser } from '@/lib/auth/requireApiUser'
import { executePlaidSyncRun, latestPlaidSyncRun, queuePlaidSyncRun } from '@/lib/plaid-sync/orchestrator'
import { createServerSupabase } from '@/lib/supabase/server'
import { after, NextResponse } from 'next/server'

export async function GET() {
  const { supabase } = await createServerSupabase()
  const auth = await requireApiUser(supabase)
  if (!auth.ok) return auth.response
  try {
    const run = await latestPlaidSyncRun(supabase, auth.user.id)
    const { data: success } = await supabase.from('plaid_sync_runs').select('completed_at').eq('user_id', auth.user.id).eq('status', 'completed').order('completed_at', { ascending: false }).limit(1).maybeSingle()
    return NextResponse.json({ run: run ? { ...run, last_successful_at: success?.completed_at || null } : null })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo leer el estado.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { supabase } = await createServerSupabase()
  const auth = await requireApiUser(supabase)
  if (!auth.ok) return auth.response
  try {
    const body = await request.json().catch(() => ({})) as { retry_run_id?: string }
    const queued = await queuePlaidSyncRun({ userId: auth.user.id, trigger: body.retry_run_id ? 'retry' : 'manual', retryOfRunId: body.retry_run_id || null })
    if (queued.created) after(() => executePlaidSyncRun(queued.run.id, auth.user.id))
    return NextResponse.json(queued, { status: queued.created ? 202 : 200 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo iniciar la sincronización.' }, { status: 500 })
  }
}
