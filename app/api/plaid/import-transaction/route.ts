import { reconcileMovement } from '@/lib/finance/reconcileMovement'
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

type PlaidImport = {
  id: string
  user_id: string
  transaction_date: string | null
  merchant: string | null
  amount: number | string | null
  suggested_category: string | null
  plaid_transaction_id: string | null
}

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

    const { data: item, error: itemError } = await supabase
      .from('plaid_imports')
      .select('*')
      .eq('id', body.id)
      .eq('user_id', user.id)
      .single()

    if (itemError || !item) {
      logDevError('Plaid import lookup failed', itemError, {
        plaid_import_id: body.id,
        user_id: user.id,
      })

      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    const plaidImport = item as PlaidImport

    if (plaidImport.user_id !== user.id) {
      logDevError('Plaid import user mismatch', null, {
        plaid_import_id: plaidImport.id,
        user_id: user.id,
      })

      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    let category = item.suggested_category || 'Revisar'

    if (category === 'Transferencia') {
      category =
        Number(item.amount) < 0
          ? 'Transferencia Enviada'
          : 'Transferencia Recibida'
    }

    if (plaidImport.plaid_transaction_id) {
      const { data: existingEntry, error: existingEntryError } = await supabase
        .from('quick_entries')
        .select('id')
        .eq('plaid_transaction_id', plaidImport.plaid_transaction_id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (existingEntryError) {
        logDevError('Quick entry duplicate check failed', existingEntryError, {
          plaid_import_id: plaidImport.id,
          plaid_transaction_id: plaidImport.plaid_transaction_id,
          user_id: user.id,
        })

        return NextResponse.json(
          { error: 'Could not import transaction' },
          { status: 500 }
        )
      }

      if (existingEntry) {
        const { error: updateError } = await supabase
          .from('plaid_imports')
          .update({ imported: true })
          .eq('id', plaidImport.id)
          .eq('user_id', user.id)

        if (updateError) {
          logDevError('Plaid import status update failed', updateError, {
            plaid_import_id: plaidImport.id,
            quick_entry_id: existingEntry.id,
            user_id: user.id,
          })

          return NextResponse.json(
            { error: 'Transaction already imported but status update failed' },
            { status: 500 }
          )
        }

        return NextResponse.json({
          success: true,
          alreadyImported: true,
        })
      }
    }

    const { data: insertedEntry, error: entryError } = await supabase
      .from('quick_entries')
      .insert({
        entry_date: plaidImport.transaction_date,
        description: plaidImport.merchant,
        amount: Number(plaidImport.amount || 0),
        entry_type: Number(plaidImport.amount) < 0 ? 'income' : 'expense',
        owner: 'Manuel',
        category,
        source: 'plaid',
        plaid_transaction_id: plaidImport.plaid_transaction_id,
        user_id: user.id,
      })
      .select('*')
      .single()

    if (entryError) {
      logDevError('Quick entry insert failed for Plaid import', entryError, {
        plaid_import_id: plaidImport.id,
        user_id: user.id,
      })

      return NextResponse.json(
        { error: 'Could not import transaction' },
        { status: 500 }
      )
    }

    try {
      await reconcileMovement(supabase, insertedEntry)
    } catch (error) {
      logDevError('Plaid import reconcileMovement failed', error, {
        plaid_import_id: plaidImport.id,
        quick_entry_id: insertedEntry?.id,
        user_id: user.id,
      })

      return NextResponse.json(
        { error: 'Transaction imported but reconciliation failed' },
        { status: 500 }
      )
    }

    const { error: updateError } = await supabase
      .from('plaid_imports')
      .update({ imported: true })
      .eq('id', plaidImport.id)
      .eq('user_id', user.id)

    if (updateError) {
      logDevError('Plaid import status update failed', updateError, {
        plaid_import_id: plaidImport.id,
        user_id: user.id,
      })

      return NextResponse.json(
        { error: 'Transaction imported but status update failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logDevError('Plaid import unexpected server error', error)

    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 }
    )
  }
}
