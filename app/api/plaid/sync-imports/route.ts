import { categorizeTransaction } from '@/lib/financial-engine/categorizeTransaction'
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/requireUser'
import { createServerSupabase } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'
import { decrypt } from '@/lib/security/encryption'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const configuration = new Configuration({
  basePath:
    PlaidEnvironments[
      process.env.PLAID_ENV as keyof typeof PlaidEnvironments
    ],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
      'PLAID-SECRET': process.env.PLAID_SECRET!,
    },
  },
})

const plaidClient = new PlaidApi(configuration)

type PlaidConnectionRow = {
  id: string
  user_id: string
  institution_name: string | null
  encrypted_access_token: string
  token_iv: string
  token_auth_tag: string
}

type PlaidAccountRow = {
  plaid_account_id: string | null
  name: string | null
  institution_name: string | null
  type: string | null
  subtype: string | null
}

type ExistingPlaidImportRow = {
  id: string
  plaid_transaction_id: string | null
  plaid_account_id: string | null
  account_name: string | null
  institution_name: string | null
  account_type: string | null
  account_subtype: string | null
  imported: boolean | null
}

type PlaidSyncFailure = {
  id: string
  institution_name: string | null
  error_code: string
}

function plaidErrorDetails(error: unknown) {
  const plaidError = error as {
    response?: {
      data?: {
        error_code?: string
      }
    }
    message?: string
  }

  return plaidError.response?.data?.error_code || plaidError.message
}

function hasGoodValue(value: string | null | undefined) {
  return Boolean(value && value.trim() && value !== 'Unknown')
}

async function existingImportsByTransactionId(
  userId: string,
  plaidTransactionIds: string[]
) {
  if (plaidTransactionIds.length === 0) {
    return new Map<string, ExistingPlaidImportRow>()
  }

  const { data, error } = await supabaseAdmin
    .from('plaid_imports')
    .select(
      'id, plaid_transaction_id, plaid_account_id, account_name, institution_name, account_type, account_subtype, imported'
    )
    .eq('user_id', userId)
    .in('plaid_transaction_id', plaidTransactionIds)

  if (error) throw error

  return new Map(
    ((data || []) as ExistingPlaidImportRow[])
      .filter((row) => row.plaid_transaction_id)
      .map((row) => [row.plaid_transaction_id as string, row])
  )
}

async function backfillPlaidImportAccountContext(userId: string) {
  const [importsResult, accountsResult] = await Promise.all([
    supabaseAdmin
      .from('plaid_imports')
      .select(
        'id, plaid_transaction_id, plaid_account_id, account_name, institution_name, account_type, account_subtype, imported'
      )
      .eq('user_id', userId)
      .not('plaid_account_id', 'is', null),
    supabaseAdmin
      .from('plaid_accounts')
      .select('plaid_account_id, name, institution_name, type, subtype')
      .eq('user_id', userId),
  ])

  if (importsResult.error) throw importsResult.error
  if (accountsResult.error) throw accountsResult.error

  const accountsByPlaidId = new Map(
    ((accountsResult.data || []) as PlaidAccountRow[])
      .filter((account) => account.plaid_account_id)
      .map((account) => [account.plaid_account_id as string, account])
  )
  let backfilledRows = 0

  for (const plaidImport of (importsResult.data ||
    []) as ExistingPlaidImportRow[]) {
    if (!plaidImport.plaid_account_id) continue

    const account = accountsByPlaidId.get(plaidImport.plaid_account_id)
    if (!account) continue

    const update: Partial<{
      account_name: string
      institution_name: string
    }> = {}

    if (!hasGoodValue(plaidImport.account_name) && hasGoodValue(account.name)) {
      update.account_name = account.name as string
    }

    if (
      !hasGoodValue(plaidImport.institution_name) &&
      hasGoodValue(account.institution_name)
    ) {
      update.institution_name = account.institution_name as string
    }

    if (Object.keys(update).length === 0) continue

    const { error } = await supabaseAdmin
      .from('plaid_imports')
      .update(update)
      .eq('user_id', userId)
      .eq('id', plaidImport.id)

    if (error) throw error

    backfilledRows += 1
  }

  return backfilledRows
}

async function markAlreadyPromotedImportsImported(userId: string) {
  const [importsResult, quickEntriesResult] = await Promise.all([
    supabaseAdmin
      .from('plaid_imports')
      .select('id, plaid_transaction_id')
      .eq('user_id', userId)
      .eq('imported', false)
      .not('plaid_transaction_id', 'is', null),
    supabaseAdmin
      .from('quick_entries')
      .select('plaid_transaction_id')
      .eq('user_id', userId)
      .not('plaid_transaction_id', 'is', null),
  ])

  if (importsResult.error) throw importsResult.error
  if (quickEntriesResult.error) throw quickEntriesResult.error

  const confirmedPlaidTransactionIds = new Set(
    ((quickEntriesResult.data || []) as Array<{
      plaid_transaction_id: string | null
    }>)
      .map((entry) => entry.plaid_transaction_id)
      .filter((id): id is string => Boolean(id))
  )
  const importIdsToClean = ((importsResult.data || []) as Array<{
    id: string
    plaid_transaction_id: string | null
  }>)
    .filter(
      (plaidImport) =>
        plaidImport.plaid_transaction_id &&
        confirmedPlaidTransactionIds.has(plaidImport.plaid_transaction_id)
    )
    .map((plaidImport) => plaidImport.id)

  if (importIdsToClean.length === 0) return 0

  const { error } = await supabaseAdmin
    .from('plaid_imports')
    .update({ imported: true })
    .eq('user_id', userId)
    .in('id', importIdsToClean)

  if (error) throw error

  return importIdsToClean.length
}

async function countPendingImportsFromSync(
  userId: string,
  plaidTransactionIds: string[]
) {
  if (plaidTransactionIds.length === 0) return 0

  const { count, error } = await supabaseAdmin
    .from('plaid_imports')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('imported', false)
    .in('plaid_transaction_id', plaidTransactionIds)

  if (error) throw error

  return count ?? 0
}

export async function POST() {
  try {
    const { supabase } = await createServerSupabase()
    const { user } = await requireUser(supabase)

    const { data: connections, error: connectionsError } =
      await supabaseAdmin
        .from('plaid_connections')
        .select('*')
        .eq('user_id', user.id)
        .not('encrypted_access_token', 'is', null)
        .order('created_at', { ascending: false })

    if (connectionsError || !connections || connections.length === 0) {
      return NextResponse.json(
        { error: 'No Plaid connections found' },
        { status: 404 }
      )
    }

    let transactionsReturnedByPlaid = 0
    let newImportsCreated = 0
    const returnedPlaidTransactionIds: string[] = []
    const failedConnections: PlaidSyncFailure[] = []

    for (const connection of connections as PlaidConnectionRow[]) {
      const accessToken = decrypt(
        connection.encrypted_access_token,
        connection.token_iv,
        connection.token_auth_tag
      )

      let response

      try {
        response = await plaidClient.transactionsSync({
          access_token: accessToken,
          count: 50,
        })
      } catch (error: unknown) {
        const errorCode = plaidErrorDetails(error) || 'UNKNOWN_ERROR'

        console.error(
          'Plaid connection skipped:',
          connection.institution_name,
          errorCode
        )
        failedConnections.push({
          id: connection.id,
          institution_name: connection.institution_name,
          error_code: errorCode,
        })
        continue
      }

      const transactions = response.data.added || []
      const plaidTransactionIds = transactions.map(
        (transaction) => transaction.transaction_id
      )
      const existingImports = await existingImportsByTransactionId(
        user.id,
        plaidTransactionIds
      )

      transactionsReturnedByPlaid += transactions.length
      newImportsCreated += plaidTransactionIds.filter(
        (plaidTransactionId) => !existingImports.has(plaidTransactionId)
      ).length
      returnedPlaidTransactionIds.push(...plaidTransactionIds)

      const { data: plaidAccounts } = await supabaseAdmin
        .from('plaid_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('connection_id', connection.id)

      const accountsByPlaidId = new Map(
        ((plaidAccounts || []) as PlaidAccountRow[]).map((account) => [
          account.plaid_account_id,
          account,
        ])
      )

      const rows = transactions.map((transaction) => {
        const existingImport = existingImports.get(transaction.transaction_id)
        const merchant =
          transaction.merchant_name ||
          transaction.name ||
          'Unknown'

        const plaidPrimary =
          transaction.personal_finance_category?.primary || null

        const account = accountsByPlaidId.get(transaction.account_id)

        return {
          user_id: connection.user_id,
          plaid_transaction_id: transaction.transaction_id,
          plaid_account_id: transaction.account_id,
          account_name:
            existingImport?.account_name ||
            account?.name ||
            null,
          institution_name:
            existingImport?.institution_name ||
            account?.institution_name ||
            connection.institution_name ||
            null,
          account_type:
            existingImport?.account_type ||
            account?.type ||
            null,
          account_subtype:
            existingImport?.account_subtype ||
            account?.subtype ||
            null,
          account_mask: null,
          transaction_date: transaction.date,
          merchant,
          amount: transaction.amount,
          plaid_category: plaidPrimary,
          suggested_category: categorizeTransaction(merchant, plaidPrimary),
          imported: existingImport?.imported === true,
        }
      })

      if (rows.length > 0) {
        const { error: upsertError } = await supabaseAdmin
          .from('plaid_imports')
          .upsert(rows, {
            onConflict: 'plaid_transaction_id',
          })

        if (upsertError) {
          console.error('Plaid imports upsert error:', upsertError)

          return NextResponse.json(
            { error: 'Could not sync Plaid transactions' },
            { status: 500 }
          )
        }
      }
    }

    const account_context_backfilled =
      await backfillPlaidImportAccountContext(user.id)
    const already_confirmed_imports_cleaned =
      await markAlreadyPromotedImportsImported(user.id)
    const pending_imports_from_sync = await countPendingImportsFromSync(
      user.id,
      returnedPlaidTransactionIds
    )

    return NextResponse.json({
      imported_count: transactionsReturnedByPlaid,
      transactions_returned_by_plaid: transactionsReturnedByPlaid,
      new_imports_created: newImportsCreated,
      pending_imports_from_sync,
      account_context_backfilled,
      already_confirmed_imports_cleaned,
      failed_connections: failedConnections,
    })
  } catch (error) {
    console.error('Plaid sync-imports error:', error)

    return NextResponse.json(
      { error: 'Unable to sync Plaid transactions' },
      { status: 500 }
    )
  }
}
