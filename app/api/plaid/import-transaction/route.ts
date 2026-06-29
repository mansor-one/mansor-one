import { NextResponse } from 'next/server'
import {
  LedgerPromotionError,
  promotePlaidImportToQuickEntry,
} from '@/lib/financial-engine/ledger-promotion'
import { createServerSupabase } from '@/lib/supabase/server'

function logDevError(message: string, error: unknown, context?: Record<string, unknown>) {
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
      logDevError('Plaid import auth error', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    if (!body?.id || typeof body.id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid transaction id' },
        { status: 400 }
      )
    }

    try {
      const result = await promotePlaidImportToQuickEntry(supabase, user.id, {
        plaidImportId: body.id,
        sourceRoute: '/api/plaid/import-transaction',
      })

      if (result.alreadyImported) {
        return NextResponse.json({
          success: true,
          alreadyImported: true,
        })
      }

      return NextResponse.json({ success: true })
    } catch (error) {
      if (!(error instanceof LedgerPromotionError)) {
        throw error
      }

      logDevError('Plaid import promotion failed', error.cause || error, {
        plaid_import_id: body.id,
        user_id: user.id,
        promotion_code: error.code,
      })

      if (error.code === 'plaid_import_not_found') {
        return NextResponse.json(
          { error: 'Transaction not found' },
          { status: 404 }
        )
      }

      if (error.code === 'plaid_import_existing_update_failed') {
        return NextResponse.json(
          { error: 'Transaction already imported but status update failed' },
          { status: 500 }
        )
      }

      if (error.code === 'plaid_import_update_failed') {
        return NextResponse.json(
          { error: 'Transaction imported but status update failed' },
          { status: 500 }
        )
      }

      if (error.code === 'reconciliation_failed') {
        return NextResponse.json(
          { error: 'Transaction imported but reconciliation failed' },
          { status: 500 }
        )
      }

      return NextResponse.json(
        { error: 'Could not import transaction' },
        { status: 500 }
      )
    }
  } catch (error) {
    logDevError('Plaid import unexpected server error', error)

    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 }
    )
  }
}
