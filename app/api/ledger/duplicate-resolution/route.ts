import { NextResponse } from 'next/server'
import {
  createConfirmedLedgerDuplicateResolution,
  getLedgerSummary,
  type ConfirmedLedgerDuplicateResolutionType,
} from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

type DuplicateResolutionAction = 'mark_duplicate' | 'keep_separate'

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
      duplicateQuickEntryId: stringValue(formData.get('duplicateQuickEntryId')),
      survivorQuickEntryId: stringValue(formData.get('survivorQuickEntryId')),
      fingerprint: stringValue(formData.get('fingerprint')),
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

function parseAction(value: unknown): DuplicateResolutionAction | null {
  if (value === 'mark_duplicate' || value === 'keep_separate') return value
  return null
}

function resolutionTypeForAction(
  action: DuplicateResolutionAction
): ConfirmedLedgerDuplicateResolutionType {
  return action === 'mark_duplicate' ? 'exact_duplicate' : 'kept_separate'
}

function responseForBody(
  body: { isForm?: boolean; redirectTo?: string | null },
  payload: Record<string, unknown>,
  status = 200,
  requestUrl = 'http://localhost'
) {
  if (body.isForm) {
    const url = new URL(
      body.redirectTo || '/dev/confirmed-ledger-duplicates',
      requestUrl
    )
    url.searchParams.set(status >= 400 ? 'error' : 'resolved', '1')

    return NextResponse.redirect(url, 303)
  }

  return NextResponse.json(payload, { status })
}

export async function POST(request: Request) {
  let body: Awaited<ReturnType<typeof requestBody>> | null = null

  try {
    const { supabase } = await createServerSupabase()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      logDevError('Confirmed ledger duplicate resolution auth error', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    body = await requestBody(request)
    const action = parseAction(body.action)

    if (!action) {
      return responseForBody(
        body,
        { error: 'Unsupported duplicate resolution action' },
        400,
        request.url
      )
    }

    const duplicateQuickEntryId = stringValue(body.duplicateQuickEntryId)
    const survivorQuickEntryId = stringValue(body.survivorQuickEntryId)
    const fingerprint = stringValue(body.fingerprint)

    if (!duplicateQuickEntryId || !survivorQuickEntryId || !fingerprint) {
      return responseForBody(
        body,
        { error: 'Missing duplicate, survivor, or fingerprint' },
        400,
        request.url
      )
    }

    const ledgerSummary = await getLedgerSummary(supabase, user.id)
    const group = ledgerSummary.confirmedLedgerDuplicateGroups.find(
      (candidateGroup) => candidateGroup.fingerprint === fingerprint
    )

    if (!group) {
      return responseForBody(
        body,
        { error: 'Duplicate group is no longer active' },
        409,
        request.url
      )
    }

    const groupEntryIds = new Set(
      group.entries.map((entry) => entry.transaction.id)
    )

    if (
      !groupEntryIds.has(duplicateQuickEntryId) ||
      !groupEntryIds.has(survivorQuickEntryId) ||
      duplicateQuickEntryId === survivorQuickEntryId
    ) {
      return responseForBody(
        body,
        { error: 'Duplicate resolution does not match the candidate group' },
        409,
        request.url
      )
    }

    const resolution = await createConfirmedLedgerDuplicateResolution(
      supabase,
      user.id,
      {
        duplicateQuickEntryId,
        survivorQuickEntryId,
        resolutionType: resolutionTypeForAction(action),
        reason:
          stringValue(body.reason) ||
          (action === 'mark_duplicate'
            ? 'Confirmed from duplicate review page.'
            : 'Confirmed as a legitimate separate movement.'),
        fingerprint,
        metadata: {
          action,
          source: '/dev/confirmed-ledger-duplicates',
          survivor: group.survivor,
          groupReasons: group.reasons,
          reviewedEntries: group.entries.map((entry) => entry.transaction),
        },
      }
    )

    return responseForBody(
      body,
      {
        success: true,
        resolution,
      },
      200,
      request.url
    )
  } catch (error) {
    logDevError('Confirmed ledger duplicate resolution failed', error)

    return responseForBody(
      body || {},
      { error: 'Could not record duplicate resolution' },
      500,
      request.url
    )
  }
}
