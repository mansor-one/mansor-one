import { NextResponse } from 'next/server'
import {
  LedgerPromotionError,
  promotePlaidImportToQuickEntry,
} from '@/lib/financial-engine/ledger-promotion'
import { getSystemCategories } from '@/lib/financial-engine/categories'
import {
  getReviewQueue,
  type ReviewQueueCandidate,
} from '@/lib/financial-engine/review-queue'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireMutationOrigin } from '@/lib/security/request-origin'

type ResolutionAction = 'mark_duplicate' | 'keep_separate'

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

function parseAction(value: unknown): ResolutionAction | null {
  if (value === 'mark_duplicate' || value === 'keep_separate') return value
  return null
}

function selectedCategory(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function candidateCategory(candidate: ReviewQueueCandidate) {
  return (
    candidate.canonicalCategory?.displayName ||
    candidate.suggestedCategory ||
    null
  )
}

function eventReason(candidate: ReviewQueueCandidate, action: ResolutionAction) {
  const match = candidate.duplicateContext?.bestDuplicateMatch
  const reason =
    match?.reasons.join(' ') ||
    candidate.reasons.join(' ') ||
    'User reviewed possible duplicate.'

  return action === 'mark_duplicate'
    ? `User marked possible duplicate as duplicate. ${reason}`
    : `User kept possible duplicate as separate transaction. ${reason}`
}

function candidateSnapshot(candidate: ReviewQueueCandidate) {
  const match = candidate.duplicateContext?.bestDuplicateMatch

  return {
    candidateId: candidate.id,
    classification: candidate.classification,
    confidence: candidate.confidence,
    transaction: candidate.transaction,
    suggestedCategory: candidate.suggestedCategory,
    canonicalCategory: candidate.canonicalCategory,
    duplicateMatch: match
      ? {
          confirmedLedgerEntry: match.confirmedLedgerEntry,
          matchType: match.matchType,
          confidence: match.confidence,
          amountDifference: match.amountDifference,
          dateDifferenceDays: match.dateDifferenceDays,
          reasons: match.reasons,
        }
      : null,
    reasons: candidate.reasons,
  }
}

async function recordResolutionEvent({
  action,
  candidate,
  quickEntryId,
  userId,
}: {
  action: 'duplicate_marked' | 'separate_requested' | 'separate_confirmed'
  candidate: ReviewQueueCandidate
  quickEntryId?: string | null
  userId: string
}) {
  const match = candidate.duplicateContext?.bestDuplicateMatch

  return {
    user_id: userId,
    plaid_import_id: candidate.transaction.id,
    event_type: action,
    duplicate_quick_entry_id:
      action === 'duplicate_marked'
        ? match?.confirmedLedgerEntry.id || null
        : null,
    quick_entry_id: quickEntryId || null,
    match_type: match?.matchType || null,
    match_confidence: match?.confidence ?? null,
    reason: eventReason(
      candidate,
      action === 'duplicate_marked' ? 'mark_duplicate' : 'keep_separate'
    ),
    candidate_snapshot: candidateSnapshot(candidate),
  }
}

export async function POST(request: Request) {
  try {
    const originError = requireMutationOrigin(request)
    if (originError) return originError
    const { supabase } = await createServerSupabase()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      logDevError('Review Queue duplicate resolution auth error', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const action = parseAction(body?.action)

    if (!action) {
      return NextResponse.json(
        { error: 'Unsupported duplicate resolution action' },
        { status: 400 }
      )
    }

    if (!body?.plaidImportId || typeof body.plaidImportId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid Plaid import id' },
        { status: 400 }
      )
    }

    const category = selectedCategory(body.selectedCategory)

    if (
      category &&
      !getSystemCategories().some((item) => item.displayName === category)
    ) {
      return NextResponse.json(
        { error: 'Invalid selected category' },
        { status: 400 }
      )
    }

    const queue = await getReviewQueue(supabase, user.id)
    const candidate = queue.possibleDuplicate.find(
      (item) =>
        item.sourceTable === 'plaid_imports' &&
        item.transaction.id === body.plaidImportId &&
        item.duplicateContext
    )

    if (!candidate?.duplicateContext) {
      return NextResponse.json(
        { error: 'Candidate is not an active possible duplicate' },
        { status: 409 }
      )
    }

    if (action === 'mark_duplicate') {
      const { error: auditError } = await supabase
        .from('review_queue_resolution_events')
        .insert(
          await recordResolutionEvent({
            action: 'duplicate_marked',
            candidate,
            userId: user.id,
          })
        )

      if (auditError) {
        logDevError('Review Queue duplicate audit insert failed', auditError, {
          plaid_import_id: body.plaidImportId,
          user_id: user.id,
        })

        return NextResponse.json(
          { error: 'Could not record duplicate decision' },
          { status: 500 }
        )
      }

      const { error: updateError } = await supabase
        .from('plaid_imports')
        .update({ imported: true })
        .eq('id', candidate.transaction.id)
        .eq('user_id', user.id)

      if (updateError) {
        logDevError('Review Queue duplicate import update failed', updateError, {
          plaid_import_id: body.plaidImportId,
          user_id: user.id,
        })

        return NextResponse.json(
          { error: 'Decision recorded, but the import was not resolved' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        resolution: 'duplicate',
        duplicateQuickEntryId:
          candidate.duplicateContext.bestDuplicateMatch.confirmedLedgerEntry.id,
      })
    }

    const { error: requestedError } = await supabase
      .from('review_queue_resolution_events')
      .insert(
        await recordResolutionEvent({
          action: 'separate_requested',
          candidate,
          userId: user.id,
        })
      )

    if (requestedError) {
      logDevError(
        'Review Queue separate request audit insert failed',
        requestedError,
        {
          plaid_import_id: body.plaidImportId,
          user_id: user.id,
        }
      )

      return NextResponse.json(
        { error: 'Could not record separate-transaction decision' },
        { status: 500 }
      )
    }

    const result = await promotePlaidImportToQuickEntry(supabase, user.id, {
      plaidImportId: candidate.transaction.id,
      selectedCategory: category || candidateCategory(candidate) || undefined,
      reviewClassification: 'possibleDuplicate',
      sourceRoute: '/api/review-queue/resolve-duplicate',
      skipReconciliation: true,
    })

    const { error: confirmedError } = await supabase
      .from('review_queue_resolution_events')
      .insert(
        await recordResolutionEvent({
          action: 'separate_confirmed',
          candidate,
          quickEntryId: result.quickEntry.id,
          userId: user.id,
        })
      )

    if (confirmedError) {
      logDevError(
        'Review Queue separate confirmation audit insert failed',
        confirmedError,
        {
          plaid_import_id: body.plaidImportId,
          quick_entry_id: result.quickEntry.id,
          user_id: user.id,
        }
      )

      return NextResponse.json(
        { error: 'Transaction added, but audit confirmation failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      resolution: 'separate',
      alreadyImported: result.alreadyImported,
      quickEntryId: result.quickEntry.id,
    })
  } catch (error) {
    if (error instanceof LedgerPromotionError) {
      logDevError('Review Queue separate promotion failed', error.cause || error, {
        promotion_code: error.code,
      })

      if (error.code === 'plaid_import_not_found') {
        return NextResponse.json(
          { error: 'Transaction not found' },
          { status: 404 }
        )
      }

      return NextResponse.json(
        { error: 'Could not keep transaction as separate' },
        { status: 500 }
      )
    }

    logDevError('Review Queue duplicate resolution unexpected error', error)

    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 }
    )
  }
}
