import { NextResponse } from 'next/server'
import {
  LedgerPromotionError,
  promotePlaidImportToQuickEntry,
} from '@/lib/financial-engine/ledger-promotion'
import { getReviewQueue } from '@/lib/financial-engine/review-queue'
import { getSystemCategories } from '@/lib/financial-engine/categories'
import { createServerSupabase } from '@/lib/supabase/server'

type ConfirmImportClassification = 'readyToConfirm' | 'needsCategory' | 'athReview'

function parseExpectedClassification(
  value: unknown,
  selectedCategory: string
): ConfirmImportClassification | null {
  if (value === undefined || value === null || value === '') {
    return selectedCategory ? 'needsCategory' : 'readyToConfirm'
  }

  if (
    value === 'readyToConfirm' ||
    value === 'needsCategory' ||
    value === 'athReview'
  ) {
    return value
  }

  return null
}

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
      logDevError('Review Queue confirm auth error', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    if (!body?.plaidImportId || typeof body.plaidImportId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid Plaid import id' },
        { status: 400 }
      )
    }

    const selectedCategory =
      typeof body.selectedCategory === 'string'
        ? body.selectedCategory.trim()
        : ''
    const expectedClassification = parseExpectedClassification(
      body.expectedClassification,
      selectedCategory
    )

    if (!expectedClassification) {
      return NextResponse.json(
        { error: 'Candidate classification is not supported by confirm-import' },
        { status: 400 }
      )
    }

    if (
      (expectedClassification === 'needsCategory' ||
        expectedClassification === 'athReview') &&
      !selectedCategory
    ) {
      return NextResponse.json(
        { error: 'Select a category before adding to the ledger' },
        { status: 400 }
      )
    }

    if (
      selectedCategory &&
      !getSystemCategories().some(
        (category) => category.displayName === selectedCategory
      )
    ) {
      return NextResponse.json(
        { error: 'Invalid selected category' },
        { status: 400 }
      )
    }

    const queue = await getReviewQueue(supabase, user.id)
    const candidates =
      expectedClassification === 'needsCategory'
        ? queue.needsCategory
        : expectedClassification === 'athReview'
          ? queue.athReview
          : queue.readyToConfirm
    const candidate = candidates.find(
      (item) =>
        item.sourceTable === 'plaid_imports' &&
        item.transaction.id === body.plaidImportId &&
        item.classification === expectedClassification
    )

    if (!candidate) {
      return NextResponse.json(
        { error: 'Candidate is not confirmable for this action' },
        { status: 409 }
      )
    }

    const result = await promotePlaidImportToQuickEntry(supabase, user.id, {
      plaidImportId: candidate.transaction.id,
      selectedCategory: selectedCategory || undefined,
      reviewClassification: expectedClassification,
      sourceRoute: '/api/review-queue/confirm-import',
      skipReconciliation: true,
    })

    return NextResponse.json({
      success: true,
      alreadyImported: result.alreadyImported,
      quickEntryId: result.quickEntry.id,
    })
  } catch (error) {
    if (error instanceof LedgerPromotionError) {
      logDevError('Review Queue promotion failed', error.cause || error, {
        promotion_code: error.code,
      })

      if (error.code === 'plaid_import_not_found') {
        return NextResponse.json(
          { error: 'Transaction not found' },
          { status: 404 }
        )
      }

      if (error.code === 'reconciliation_failed') {
        return NextResponse.json(
          { error: 'Transaction imported but reconciliation failed' },
          { status: 500 }
        )
      }

      if (
        error.code === 'plaid_import_existing_update_failed' ||
        error.code === 'plaid_import_update_failed'
      ) {
        return NextResponse.json(
          { error: 'Transaction imported but status update failed' },
          { status: 500 }
        )
      }

      return NextResponse.json(
        { error: 'Could not confirm candidate' },
        { status: 500 }
      )
    }

    logDevError('Review Queue confirm unexpected server error', error)

    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 }
    )
  }
}
