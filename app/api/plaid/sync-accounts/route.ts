import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'
import { decrypt } from '@/lib/security/encryption'

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

type PlaidSyncFailure = {
  id: string
  institution_name: string | null
  error_code: string
  error_message: string
}

function plaidErrorDetails(error: unknown) {
  const plaidError = error as {
    response?: {
      data?: {
        error_code?: string
        error_message?: string
      }
    }
    message?: string
  }

  return {
    error_code:
      plaidError.response?.data?.error_code || 'UNKNOWN_ERROR',
    error_message:
      plaidError.response?.data?.error_message ||
      plaidError.message ||
      'Unknown Plaid sync error',
  }
}

export async function POST() {
  try {
    const { supabase } = await createServerSupabase()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: connections, error: connectionError } = await supabase
      .from('plaid_connections')
      .select(
        'id, user_id, institution_name, encrypted_access_token, token_iv, token_auth_tag, created_at'
      )
      .eq('user_id', user.id)
      .eq('status', 'active')
      .not('encrypted_access_token', 'is', null)
      .is('archived_at', null)
      .order('created_at', { ascending: false })

    if (connectionError) {
      const errorMessage =
        connectionError instanceof Error
          ? connectionError.message
          : String(connectionError)
      console.error('Plaid connection lookup error:', {
        message: errorMessage,
      })

      return NextResponse.json(
        { error: 'Could not load Plaid connections' },
        { status: 500 }
      )
    }

    if (!connections || connections.length === 0) {
      return NextResponse.json(
        { error: 'No Plaid connection found' },
        { status: 404 }
      )
    }

    let syncedAccounts = 0
    let syncedCreditLiabilities = 0
    const unavailableLiabilities: PlaidSyncFailure[] = []
    const failedConnections: PlaidSyncFailure[] = []

    for (const connection of connections) {
      try {
        const accessToken = decrypt(
          connection.encrypted_access_token,
          connection.token_iv,
          connection.token_auth_tag
        )

        const response = await plaidClient.accountsBalanceGet({
          access_token: accessToken,
        })

        const accounts = response.data.accounts || []

        const rows = accounts.map((account) => ({
          user_id: user.id,
          connection_id: connection.id,
          institution_name: connection.institution_name || 'Unknown',
          plaid_account_id: account.account_id,
          name: account.name,
          type: account.type,
          subtype: account.subtype,
          available_balance: account.balances.available,
          current_balance: account.balances.current,
          currency: account.balances.iso_currency_code,
          updated_at: new Date().toISOString(),
        }))

        if (rows.length > 0) {
          const { error: upsertError } = await supabase
            .from('plaid_accounts')
            .upsert(rows, {
              onConflict: 'plaid_account_id',
            })

          if (upsertError) {
            throw upsertError
          }
        }

        try {
          const liabilitiesResponse = await plaidClient.liabilitiesGet({
            access_token: accessToken,
          })
          const creditLiabilities = liabilitiesResponse.data.liabilities.credit || []
          const liabilityUpdatedAt = new Date().toISOString()

          for (const liability of creditLiabilities) {
            const { error: liabilityError } = await supabase
              .from('plaid_accounts')
              .update({
                plaid_minimum_payment_amount: liability.minimum_payment_amount,
                plaid_next_payment_due_date: liability.next_payment_due_date,
                plaid_last_statement_balance: liability.last_statement_balance,
                plaid_liability_is_overdue: liability.is_overdue,
                plaid_liability_updated_at: liabilityUpdatedAt,
              })
              .eq('user_id', user.id)
              .eq('connection_id', connection.id)
              .eq('plaid_account_id', liability.account_id)
            if (liabilityError) throw liabilityError
            syncedCreditLiabilities += 1
          }
        } catch (liabilityError: unknown) {
          unavailableLiabilities.push({
            id: connection.id,
            institution_name: connection.institution_name,
            ...plaidErrorDetails(liabilityError),
          })
        }

        syncedAccounts += accounts.length

        const { error: syncMetadataError } = await supabase
          .from('plaid_connections')
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_error: null,
          })
          .eq('id', connection.id)
          .eq('user_id', user.id)

        if (syncMetadataError) {
          console.error('Plaid connection sync metadata error:', {
            connection_id: connection.id,
            message: syncMetadataError.message,
          })
        }
      } catch (error: unknown) {
        const details = plaidErrorDetails(error)

        const { error: syncMetadataError } = await supabase
          .from('plaid_connections')
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_error: `${details.error_code}: ${details.error_message}`,
          })
          .eq('id', connection.id)
          .eq('user_id', user.id)

        if (syncMetadataError) {
          console.error('Plaid connection sync metadata error:', {
            connection_id: connection.id,
            message: syncMetadataError.message,
          })
        }

        failedConnections.push({
          id: connection.id,
          institution_name: connection.institution_name,
          ...details,
        })
      }
    }

    return NextResponse.json({
      synced_accounts: syncedAccounts,
      synced_credit_liabilities: syncedCreditLiabilities,
      unavailable_liabilities: unavailableLiabilities,
      failed_connections: failedConnections,
    })
  } catch (error) {
    console.error('Plaid sync-accounts error:', error)

    return NextResponse.json(
      { error: 'Unable to sync Plaid accounts' },
      { status: 500 }
    )
  }
}
