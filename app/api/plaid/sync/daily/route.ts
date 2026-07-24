import { executePlaidSyncRun, queuePlaidSyncRun } from '@/lib/plaid-sync/orchestrator'
import { createClient } from '@supabase/supabase-js'
import { after, NextResponse } from 'next/server'

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data, error } = await supabase.from('plaid_connections').select('user_id').eq('status', 'active').is('archived_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const userIds = [...new Set((data || []).map((row) => row.user_id).filter(Boolean))]
  const queued = []
  for (const userId of userIds) {
    const result = await queuePlaidSyncRun({ userId, trigger: 'daily' })
    queued.push({ user_id: userId, run_id: result.run.id, created: result.created, reason: result.reason })
    if (result.created) after(() => executePlaidSyncRun(result.run.id, userId))
  }
  return NextResponse.json({ queued })
}
