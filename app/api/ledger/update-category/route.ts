import { NextResponse } from 'next/server'
import { getSystemCategories } from '@/lib/financial-engine/categories'
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

function categoryForInput(value: unknown) {
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  if (!normalized) return null

  return (
    getSystemCategories().find(
      (category) =>
        category.displayName.toLowerCase() === normalized ||
        category.code.toLowerCase() === normalized
    ) || null
  )
}

export async function POST(request: Request) {
  try {
    const { supabase } = await createServerSupabase()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      logDevError('Ledger category update auth error', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    if (!body?.quickEntryId || typeof body.quickEntryId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid quick entry id' },
        { status: 400 }
      )
    }

    const category = categoryForInput(body.category)

    if (!category) {
      return NextResponse.json(
        { error: 'Invalid selected category' },
        { status: 400 }
      )
    }

    // TODO: Record this mutation in ledger_change_events once the audit table exists.
    const { data: updatedEntry, error: updateError } = await supabase
      .from('quick_entries')
      .update({ category: category.displayName })
      .eq('id', body.quickEntryId)
      .eq('user_id', user.id)
      .select('id, category')
      .maybeSingle()

    if (updateError) {
      logDevError('Ledger category update failed', updateError, {
        quick_entry_id: body.quickEntryId,
        user_id: user.id,
      })

      return NextResponse.json(
        { error: 'Could not update category' },
        { status: 500 }
      )
    }

    if (!updatedEntry) {
      return NextResponse.json(
        { error: 'Quick entry not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      quickEntry: updatedEntry,
      category: {
        code: category.code,
        displayName: category.displayName,
      },
    })
  } catch (error) {
    logDevError('Ledger category update unexpected server error', error)

    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 }
    )
  }
}
