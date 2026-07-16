'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/requireUser'

export async function updateMerchantRuleAction(formData: FormData) {
  const ruleId = String(formData.get('ruleId') || '').trim()
  const suggestedCategory = String(formData.get('suggestedCategory') || '').trim()

  if (!ruleId) {
    redirect('/merchant-rules?error=missing_rule')
  }

  const { supabase } = await requireUser()
  const { error } = await supabase
    .from('merchant_rules')
    .update({ suggested_category: suggestedCategory })
    .eq('id', ruleId)

  if (error) {
    redirect(`/merchant-rules?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/merchant-rules')
  redirect('/merchant-rules?saved=updated')
}
