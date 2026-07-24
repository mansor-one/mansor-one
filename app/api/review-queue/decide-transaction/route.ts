import { NextResponse } from 'next/server'
import { getReviewQueue, getSystemCategories } from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'
import { decisionRequiresPlanningFund, isReviewTransactionType } from '@/lib/financial-engine/review-transaction-decision'

export async function POST(request: Request) {
  const { supabase } = await createServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const plaidImportId = typeof body.plaidImportId === 'string' ? body.plaidImportId : ''
  const transactionType = typeof body.transactionType === 'string' ? body.transactionType : ''
  const category = typeof body.category === 'string' ? body.category.trim() : ''
  const planningItemId = typeof body.planningItemId === 'string' && body.planningItemId ? body.planningItemId : null
  const owner = typeof body.owner === 'string' ? body.owner.trim() : null
  const note = typeof body.note === 'string' ? body.note.trim() : null

  if (!plaidImportId || !isReviewTransactionType(transactionType)) {
    return NextResponse.json({ error: 'Choose what this transaction represents.' }, { status: 400 })
  }

  if (transactionType !== 'ignore' && !getSystemCategories().some((item) => item.displayName === category)) {
    return NextResponse.json({ error: 'Choose a valid spending category.' }, { status: 400 })
  }

  if (decisionRequiresPlanningFund(transactionType) && !planningItemId) {
    return NextResponse.json({ error: 'Choose a goal or planning fund.' }, { status: 400 })
  }

  const queue = await getReviewQueue(supabase, user.id)
  const candidate = queue.candidates.find(
    (item) => item.sourceTable === 'plaid_imports' && item.transaction.id === plaidImportId
  )

  if (!candidate) {
    return NextResponse.json({ error: 'This transaction is no longer waiting for review.' }, { status: 409 })
  }

  const { data, error } = await supabase.rpc('confirm_review_transaction', {
    p_category: category,
    p_note: note,
    p_owner: owner,
    p_plaid_import_id: plaidImportId,
    p_planning_item_id: planningItemId,
    p_transaction_type: transactionType,
  })

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not save this transaction.' },
      { status: 409 }
    )
  }

  return NextResponse.json({ success: true, result: data })
}
