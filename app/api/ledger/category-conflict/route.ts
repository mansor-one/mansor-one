import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireMutationOrigin } from '@/lib/security/request-origin'
import { getSafeRedirectPath } from '@/lib/security/safe-redirect'
import {
  getCategoryByCode,
  getLedgerSummary,
  getResolvedDuplicateCategoryConflicts,
} from '@/lib/financial-engine'

type CategoryConflictAction =
  | 'keep_survivor'
  | 'replace_survivor'
  | 'review_later'
  | 'apply_merchant_rule'

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

function isFormRequest(request: Request) {
  const contentType = request.headers.get('content-type') || ''
  return (
    contentType.includes('form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  )
}

function stringValue(value: FormDataEntryValue | unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function requestBody(request: Request) {
  if (isFormRequest(request)) {
    const formData = await request.formData()

    return {
      action: stringValue(formData.get('action')),
      survivorQuickEntryId: stringValue(formData.get('survivorQuickEntryId')),
      categoryCode: stringValue(formData.get('categoryCode')),
      reason: stringValue(formData.get('reason')),
      redirectTo: stringValue(formData.get('redirectTo')),
      isForm: true,
    }
  }

  return {
    ...(await request.json()),
    isForm: false,
  }
}

function parseAction(value: unknown): CategoryConflictAction | null {
  if (
    value === 'keep_survivor' ||
    value === 'replace_survivor' ||
    value === 'review_later' ||
    value === 'apply_merchant_rule'
  ) {
    return value
  }

  return null
}

function responseForBody(
  body: { isForm?: boolean; redirectTo?: string | null },
  payload: Record<string, unknown>,
  status = 200,
  requestUrl = 'http://localhost'
) {
  if (body.isForm) {
    const url = new URL(
      getSafeRedirectPath(body.redirectTo, '/dev/category-conflicts'),
      requestUrl
    )
    url.searchParams.set(status >= 400 ? 'error' : 'reviewed', '1')

    return NextResponse.redirect(url, 303)
  }

  return NextResponse.json(payload, { status })
}

function actionNote({
  action,
  selectedCategory,
  reason,
}: {
  action: CategoryConflictAction
  selectedCategory: string
  reason: string | null
}) {
  const suffix = reason ? ` Reason: ${reason}` : ''

  if (action === 'replace_survivor') {
    return `[2026-07-10] Category conflict reviewed: survivor category set to ${selectedCategory}.${suffix}`
  }

  if (action === 'keep_survivor') {
    return `[2026-07-10] Category conflict reviewed: kept survivor category ${selectedCategory}.${suffix}`
  }

  return `[2026-07-10] Category conflict review deferred.${suffix}`
}

export async function POST(request: Request) {
  let body: Awaited<ReturnType<typeof requestBody>> | null = null

  try {
    const originError = requireMutationOrigin(request)
    if (originError) return originError
    const { supabase } = await createServerSupabase()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      logDevError('Category conflict review auth error', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    body = await requestBody(request)
    const action = parseAction(body.action)
    const survivorQuickEntryId = stringValue(body.survivorQuickEntryId)

    if (!action || !survivorQuickEntryId) {
      return responseForBody(
        body,
        { error: 'Missing conflict action or survivor quick entry id' },
        400,
        request.url
      )
    }

    if (action === 'apply_merchant_rule') {
      return responseForBody(
        body,
        {
          error:
            'Merchant rule creation is intentionally manual in v1. Use the merchant rules review surface.',
        },
        409,
        request.url
      )
    }

    const ledgerSummary = await getLedgerSummary(supabase, user.id)
    const conflict = getResolvedDuplicateCategoryConflicts(ledgerSummary).find(
      (item) => item.survivorQuickEntryId === survivorQuickEntryId
    )

    if (!conflict) {
      return responseForBody(
        body,
        { error: 'Category conflict is no longer active' },
        409,
        request.url
      )
    }

    const selectedCategory =
      action === 'replace_survivor'
        ? getCategoryByCode(stringValue(body.categoryCode) || '')
        : getCategoryByCode(conflict.survivorCanonicalCategoryCode)

    if (!selectedCategory) {
      return responseForBody(
        body,
        { error: 'Invalid selected category' },
        400,
        request.url
      )
    }

    const nextCategory =
      action === 'replace_survivor'
        ? selectedCategory.displayName
        : conflict.survivorCategory
    const note = actionNote({
      action,
      selectedCategory: nextCategory,
      reason: stringValue(body.reason),
    })
    const { data: existingEntry, error: existingError } = await supabase
      .from('quick_entries')
      .select('id, category, notes')
      .eq('id', conflict.survivorQuickEntryId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingError) {
      logDevError('Could not load conflict survivor row', existingError, {
        quick_entry_id: conflict.survivorQuickEntryId,
      })

      return responseForBody(
        body,
        { error: 'Could not load survivor quick entry' },
        500,
        request.url
      )
    }

    if (!existingEntry) {
      return responseForBody(
        body,
        { error: 'Survivor quick entry not found' },
        404,
        request.url
      )
    }

    const nextNotes = [existingEntry.notes, note]
      .filter((value): value is string => Boolean(value))
      .join('\n')
    let updateQuery = supabase
      .from('quick_entries')
      .update({
        ...(action === 'replace_survivor' ? { category: nextCategory } : {}),
        notes: nextNotes,
      })
      .eq('id', conflict.survivorQuickEntryId)
      .eq('user_id', user.id)

    if (action === 'replace_survivor') {
      updateQuery = updateQuery.eq('category', existingEntry.category)
    }

    const { data: updatedEntry, error: updateError } = await updateQuery
      .select('id, category, notes')
      .maybeSingle()

    if (updateError) {
      logDevError('Category conflict review update failed', updateError, {
        quick_entry_id: conflict.survivorQuickEntryId,
      })

      return responseForBody(
        body,
        { error: 'Could not review category conflict' },
        500,
        request.url
      )
    }

    return responseForBody(
      body,
      {
        success: true,
        action,
        quickEntry: updatedEntry,
      },
      200,
      request.url
    )
  } catch (error) {
    logDevError('Category conflict review failed', error)

    return responseForBody(
      body || {},
      { error: 'Could not review category conflict' },
      500,
      request.url
    )
  }
}
