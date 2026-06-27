import { NextResponse } from 'next/server'
import { categorizeTransaction } from '@/lib/financial-engine/categorizeTransaction'
import { createServerSupabase } from '@/lib/supabase/server'

type SuggestionStatus = 'suggested' | 'needs_review'

type SuggestionRow = {
  id: string
  plaid_import_id: string
  suggested_category: string
  status: SuggestionStatus
}

type PlaidImportRow = {
  id: string
  merchant: string | null
  plaid_category: string | null
}

const REVIEW_QUESTION = '¿Qué categoría debe tener esta transacción?'

function suggestionStatus(category: string): SuggestionStatus {
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

  const { data: suggestionsData, error: suggestionsError } = await supabase
    .from('transaction_suggestions')
    .select('id, plaid_import_id, suggested_category, status')
    .eq('user_id', user.id)
    .eq('source', 'plaid_import')
    .in('status', ['suggested', 'needs_review'])
    .not('plaid_import_id', 'is', null)

  if (suggestionsError) {
    return NextResponse.json(
      { error: 'Could not read Plaid suggestions' },
      { status: 500 }
    )
  }

  const suggestions = (suggestionsData || []) as SuggestionRow[]
  const plaidImportIds = suggestions.map(
    (suggestion) => suggestion.plaid_import_id
  )

  const { data: plaidImportsData, error: plaidImportsError } =
    plaidImportIds.length > 0
      ? await supabase
          .from('plaid_imports')
          .select('id, merchant, plaid_category')
          .eq('user_id', user.id)
          .in('id', plaidImportIds)
      : { data: [], error: null }

  if (plaidImportsError) {
    return NextResponse.json(
      { error: 'Could not read linked Plaid imports' },
      { status: 500 }
    )
  }

  const plaidImports = (plaidImportsData || []) as PlaidImportRow[]
  const plaidImportsById = new Map(
    plaidImports.map((plaidImport) => [plaidImport.id, plaidImport])
  )

  let missingPlaidImports = 0
  let unchangedSuggestions = 0
  let updatedSuggestions = 0
  let ignoredReviewItems = 0
  let createdReviewItems = 0
  let skippedReviewItems = 0

  for (const suggestion of suggestions) {
    const plaidImport = plaidImportsById.get(suggestion.plaid_import_id)

    if (!plaidImport) {
      missingPlaidImports += 1
      continue
    }

    const recalculatedCategory = categorizeTransaction(
      plaidImport.merchant || '',
      plaidImport.plaid_category
    )

    if (recalculatedCategory === suggestion.suggested_category) {
      unchangedSuggestions += 1
      continue
    }

    const nextStatus = suggestionStatus(recalculatedCategory)
    const { error: updateSuggestionError } = await supabase
      .from('transaction_suggestions')
      .update({
        suggested_category: recalculatedCategory,
        confidence_score: confidenceScore(recalculatedCategory),
        status: nextStatus,
        reason: 'Recalculated from categorizeTransaction',
      })
      .eq('user_id', user.id)
      .eq('id', suggestion.id)

    if (updateSuggestionError) {
      return NextResponse.json(
        { error: 'Could not update transaction suggestion' },
        { status: 500 }
      )
    }

    updatedSuggestions += 1

    if (suggestion.status === 'needs_review' && nextStatus === 'suggested') {
      const { data: ignoredItems, error: ignoreReviewItemsError } =
        await supabase
          .from('transaction_review_items')
          .update({ status: 'ignored' })
          .eq('user_id', user.id)
          .eq('suggestion_id', suggestion.id)
          .eq('status', 'pending')
          .select('id')

      if (ignoreReviewItemsError) {
        return NextResponse.json(
          { error: 'Could not ignore pending review items' },
          { status: 500 }
        )
      }

      ignoredReviewItems += ignoredItems?.length || 0
    }

    if (suggestion.status === 'suggested' && nextStatus === 'needs_review') {
      const { data: existingReviewItem, error: existingReviewItemError } =
        await supabase
          .from('transaction_review_items')
          .select('id')
          .eq('user_id', user.id)
          .eq('suggestion_id', suggestion.id)
          .eq('status', 'pending')
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
  }

  return NextResponse.json({
    success: true,
    scannedSuggestions: suggestions.length,
    missingPlaidImports,
    unchangedSuggestions,
    updatedSuggestions,
    ignoredReviewItems,
    createdReviewItems,
    skippedReviewItems,
  })
}
