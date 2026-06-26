import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase/server'

export async function requireUser(supabaseClient?: SupabaseClient) {
  const supabase =
    supabaseClient || (await createServerSupabase()).supabase

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  return {
    supabase,
    user,
  }
}
