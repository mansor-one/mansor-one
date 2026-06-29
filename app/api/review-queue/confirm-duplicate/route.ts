import { NextResponse } from 'next/server'
import { getReviewQueue } from '@/lib/financial-engine/review-queue'
import { createServerSupabase } from '@/lib/supabase/server'

function logDevError(
  message: string,
  error: unknown,
  context?: Record<string, unknown>
) {
  if (process.env.NODE_ENV === 'production') return

  const safeError =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : error

  console.error(message, {
    ...context,
    error: safeError,
  })
}

export async function POST(request: Request) {
  try {
    const { supabase } = await createServerSupabase()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      logDevError('Review Queue duplicate auth error', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    if (!body?.plaidImportId || typeof body.plaidImportId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid Plaid import id' },
        { status: 400 }
      )
    }

    const queue = await getReviewQueue(supabase, user.id)
    const candidate = queue.possibleDuplicate.find(
      (item) =>
        item.sourceTable === 'plaid_imports' &&
        item.transaction.id === body.plaidImportId &&
        item.duplicateContext?.bestDuplicateMatch.matchType ===
          'plaid_transaction_id'
    )

    if (!candidate?.transaction.plaidTransactionId) {
      return NextResponse.json(
        { error: 'Candidate is not a direct Plaid duplicate' },
        { status: 409 }
      )
    }

    const { data: existingEntry, error: existingEntryError } = await supabase
      .from('quick_entries')
      .select('id')
      .eq('user_id', user.id)
      .eq('plaid_transaction_id', candidate.transaction.plaidTransactionId)
      .maybeSingle()

    if (existingEntryError) {
      logDevError('Review Queue duplicate quick entry lookup failed', existingEntryError, {
        plaid_import_id: body.plaidImportId,
        user_id: user.id,
      })

      return NextResponse.json(
        { error: 'Could not verify duplicate' },
        { status: 500 }
      )
    }

    if (!existingEntry) {
      return NextResponse.json(
        { error: 'Matching quick entry was not found' },
        { status: 409 }
      )
    }

    const { error: updateError } = await supabase
      .from('plaid_imports')
      .update({ imported: true })
      .eq('id', candidate.transaction.id)
      .eq('user_id', user.id)
      .eq('plaid_transaction_id', candidate.transaction.plaidTransactionId)

    if (updateError) {
      logDevError('Review Queue duplicate import update failed', updateError, {
        plaid_import_id: body.plaidImportId,
        quick_entry_id: existingEntry.id,
        user_id: user.id,
      })

      return NextResponse.json(
        { error: 'Could not mark duplicate as imported' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      alreadyImported: true,
      quickEntryId: existingEntry.id,
    })
  } catch (error) {
    logDevError('Review Queue duplicate unexpected server error', error)

    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 }
    )
  }
}
