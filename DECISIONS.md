# Architectural Decisions

## ADR-001: Pending Settlement is not unpaid risk

A manual “already paid” confirmation moves an obligation to `pending_settlement`. It remains visible and auditable but is excluded from Financial Health risk and projected unpaid cash outflow until settlement evidence arrives or the decision is reversed.

## ADR-002: Automatic reconciliation requires a unique score of at least 90%

Automatic reconciliation is allowed only for one unique high-confidence confirmed transaction. Amount-only evidence, low-confidence matches, and ambiguous matches remain open for review. Confidence thresholds are not presentation settings.

## ADR-003: Retirement assets are not spendable cash

Retirement and investment accounts remain part of Assets and Net Worth. They enter usable cash only through explicit spendability configuration. This prevents Financial Health from treating long-term assets as bill-paying liquidity.

## ADR-004: Allocation and spending are separate planning facts

`allocated_amount` records planned/reserved money. `spent_amount` records confirmed transactions associated with the fund. A planning-fund association does not replace canonical spending category.

## ADR-005: Card data uses field-level authority

Card identity is composed from explicit links and conservative aliases. Plaid owns connected balances and available credit. Minimum-payment precedence is Plaid Liabilities, manual card, recurring schedule, then Timeline instance. Missing values are never estimated.

## ADR-006: Payment accounts use structured references

New manual payment confirmations store `payment_account_id` and `payment_account_source` in addition to a human-readable label. The source namespace supports Plaid accounts, manual accounts, cash, and other methods without a misleading cross-table foreign key.

## ADR-007: Historical text-only confirmations are preserved

The structured-account migration is nullable. Existing `payment_method` strings remain valid audit evidence and are not guessed into account IDs.

## ADR-008: Grace deadline governs overdue status

The contractual due date remains visible, but a configured grace deadline is the effective overdue boundary used by payment truth, Financial Health, Cash Flow, and Timeline. A grace range does not create repeated obligations.

## ADR-009: Review Queue precedes confirmed history

Plaid and ATH imports are evidence, not automatically confirmed household history. Review Queue is where ambiguous meaning and duplicate status are decided. Promotion to `quick_entries` is idempotent and preserves source lineage.

## ADR-010: Financial history is superseded, not silently deleted

Pending replacements, removed Plaid transactions, and confirmed-ledger duplicates retain their rows and explicit lifecycle/resolution records. Calculation queries exclude inactive representations without erasing audit history.
