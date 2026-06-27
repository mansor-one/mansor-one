import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

type PlaidImportRow = {
  id: string
  suggested_category: string | null
}

type SuggestionRow = {
  id: string
  status: string
}

const REVIEW_QUESTION = '¿Qué categoría debe tener esta transacción?'

function suggestionStatus(category: string) {
  return category === 'Revisar' ? 'needs_review' : 'suggested'
}

function confidenceScore(category: string) {
  return category === 'Revisar' ? 0.3 : 0.8
}

export async function POST() {
  const { supabase } = await createServerSupabase()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: plaidImports, error: plaidImportsError } = await supabase
    .from('plaid_imports')
    .select('id, suggested_category')
    .eq('user_id', user.id)
    .eq('imported', false)
    .not('suggested_category', 'is', null)

  if (plaidImportsError) {
    return NextResponse.json(
      { error: 'Could not read Plaid imports' },
      { status: 500 }
    )
  }

  const rows = (plaidImports || []) as PlaidImportRow[]
  let createdSuggestions = 0
  let skippedSuggestions = 0
  let createdReviewItems = 0
  let skippedReviewItems = 0

  for (const plaidImport of rows) {
    const category = plaidImport.suggested_category || 'Revisar'
    const status = suggestionStatus(category)

    const { data: existingSuggestion, error: existingSuggestionError } =
      await supabase
        .from('transaction_suggestions')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('plaid_import_id', plaidImport.id)
        .eq('source', 'plaid_import')
        .maybeSingle()

    if (existingSuggestionError) {
      return NextResponse.json(
        { error: 'Could not check existing suggestions' },
        { status: 500 }
      )
    }

    let suggestion = existingSuggestion as SuggestionRow | null

    if (suggestion) {
      skippedSuggestions += 1
    } else {
      const { data: insertedSuggestion, error: insertSuggestionError } =
        await supabase
          .from('transaction_suggestions')
          .insert({
            user_id: user.id,
            plaid_import_id: plaidImport.id,
            source: 'plaid_import',
            suggested_category: category,
            confidence_score: confidenceScore(category),
            status,
            reason: 'Generated from plaid_imports.suggested_category',
            metadata: {},
          })
          .select('id, status')
          .single()

      if (insertSuggestionError || !insertedSuggestion) {
        return NextResponse.json(
          { error: 'Could not create transaction suggestion' },
          { status: 500 }
        )
      }

      suggestion = insertedSuggestion as SuggestionRow
      createdSuggestions += 1
    }

    if (suggestion.status !== 'needs_review') {
      continue
    }

    const { data: existingReviewItem, error: existingReviewItemError } =
      await supabase
        .from('transaction_review_items')
        .select('id')
        .eq('user_id', user.id)
        .eq('suggestion_id', suggestion.id)
        .maybeSingle()

    if (existingReviewItemError) {
      return NextResponse.json(
        { error: 'Could not check existing review items' },
        { status: 500 }
      )
    }

    if (existingReviewItem) {
      skippedReviewItems += 1
      continue
    }

    const { error: insertReviewItemError } = await supabase
      .from('transaction_review_items')
      .insert({
        user_id: user.id,
        suggestion_id: suggestion.id,
        question: REVIEW_QUESTION,
        status: 'pending',
      })

    if (insertReviewItemError) {
      return NextResponse.json(
        { error: 'Could not create transaction review item' },
        { status: 500 }
      )
    }

    createdReviewItems += 1
  }

  return NextResponse.json({
    success: true,
    scannedPlaidImports: rows.length,
    createdSuggestions,
    skippedSuggestions,
    createdReviewItems,
    skippedReviewItems,
  })
}
