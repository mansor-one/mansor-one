export type PlaidSyncSummary = {
  accounts_updated: number
  liabilities_updated: number
  transactions_added_or_updated: number
  payments_reconciled: number
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {}
}

function count(value: unknown) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function summaryFromPlaidStepResults(
  results: Record<string, unknown>
): PlaidSyncSummary {
  const accounts = record(results.accounts)
  const liabilities = record(results.liabilities)
  const transactions = record(results.transactions)
  const reconciliation = record(results.reconciliation)
  const payment = record(reconciliation.payment)

  return {
    accounts_updated: count(accounts.synced_accounts),
    liabilities_updated: count(liabilities.synced_credit_liabilities),
    transactions_added_or_updated:
      count(transactions.new_imports_created) +
      count(transactions.modified_imports_updated),
    payments_reconciled: count(payment.automaticallyReconciled),
  }
}

export function resolvedPlaidSyncSummary({
  summary,
  stepResults,
}: {
  summary: Record<string, unknown> | null | undefined
  stepResults: Record<string, unknown> | null | undefined
}) {
  const stored = record(summary)
  if (Object.keys(stored).length > 0) {
    return {
      accounts_updated: count(stored.accounts_updated),
      liabilities_updated: count(stored.liabilities_updated),
      transactions_added_or_updated: count(
        stored.transactions_added_or_updated
      ),
      payments_reconciled: count(stored.payments_reconciled),
    }
  }

  return summaryFromPlaidStepResults(record(stepResults))
}
