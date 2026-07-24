# Financial Integrity Report

Last updated: 2026-07-16

## Scope

Phase 2 focuses on data completeness and trustworthiness. This pass expanded
the read-only Data Health Inspector and documented remaining metadata gaps. It
did not change schema, move calculations into React, implement AI, implement
Atlas, implement MCP, redesign UI, or repair live financial rows.

## Financial Integrity Score

Current implementation readiness: 72/100.

This score reflects Data Health coverage and architecture readiness, not a live
claim that all household data is complete. A live authenticated Data Health run
is still required before Robototina AI or Atlas can depend on the data without
human review.

## Cards Completion Report

Implementation coverage: 74/100.

Covered by Cards Summary and Data Health:

- Active card inventory.
- Manual, Plaid, and merged card profiles.
- Owner, institution, source, active/archived state.
- Current balance, available credit, credit limit, utilization.
- APR, promotional APR, promo end date, interest notes.
- Due day, next due date, minimum payment, schedule link.
- Autopay metadata and warnings.
- Duplicate manual profile warnings.

New Phase 2 Data Health checks:

- Cards missing credit limit.
- Cards missing available credit.
- Cards missing current balance.
- Raw active card rows missing statement balance.
- Raw active card rows missing statement date.
- Closed, archived, or inactive raw card rows visible in source.

Known gaps:

- Statement balance and statement date may be absent from current schema/source
  for some card rows.
- APR and promotional APR still rely on manual metadata when Plaid does not
  provide it.
- Card completeness must be verified live through `/dev/data-health`.

## Income Completion Report

Implementation coverage: 70/100.

Covered by Data Health:

- Active income rows.
- Stale expected income.
- Destination account/source.
- Estimated versus confirmed confidence.
- Required signals for Soraya, pension, unemployment, and severance.
- Duplicate income concept groups.

New Phase 2 Data Health checks:

- Missing owner or owner scope.
- Missing frequency/cadence/income type.
- Active rows missing expected amount.
- Received rows missing received amount/date/name signals.

Known gaps:

- A received-income ledger relation is not yet a formal contract.
- Income source provenance from Plaid/Gmail/manual is not fully normalized.
- Robototina should not treat missing income as absence until live Data Health
  confirms the source.

## Plaid Health Report

Implementation coverage: 73/100.

Covered by Data Health:

- Active Plaid connections.
- Active account rows.
- Duplicate logical account identities.
- Stale sync state.
- Ownership, status, and dashboard inclusion flags.

New Phase 2 Data Health checks:

- Expired/reconnect/error connection state.
- Archived, hidden, inactive, excluded, or disconnected account rows.
- Plaid import row availability and review/status metadata.

Known gaps:

- Runtime retry state and webhook health are not production-complete.
- Plaid provider callback strategy remains a deployment task.
- Institution health is visible as data quality, not yet as a full operations
  model.

## ATH Integrity Report

Implementation coverage: 66/100.

Covered by Data Health:

- Unmatched ATH email rows.
- Transferred-between-cards rows.
- Internal transfer classification mismatches.
- Transfer-like ledger rows that could distort spending/income totals.

New Phase 2 Data Health checks:

- Duplicate transfer-like groups.
- Pending, review, ambiguous, or unmatched ATH/transfer rows.

Known gaps:

- ATH reconciliation confidence is still distributed across parsing, ledger,
  and review workflows.
- False-positive and false-negative review still requires human validation.
- A formal TransferSummary contract is still missing.

## Transfer Integrity Report

Implementation coverage: 61/100.

Covered by Data Health:

- Transfer-like confirmed ledger rows.
- Cooperativa/FirstBank candidate rows.
- ATH/internal-transfer classification.
- Duplicate transfer-like grouping.
- Pending/ambiguous transfer signals.

Known gaps:

- No official transfer ledger/contract exists yet.
- Credit-card payments and checking/savings transfers are detected by
  heuristics, not normalized as first-class transfers.
- Future Decision Engine and Robototina transfer reasoning should wait for a
  TransferSummary contract.

## Planning Integrity Report

Implementation coverage: 68/100.

Covered by Data Health:

- Active planning items.
- Zero allocations.
- Stale due dates.
- Duplicate concepts.
- Items that may belong in obligations instead.

New Phase 2 Data Health checks:

- Active planning items missing owner, status, or priority signals.

Known gaps:

- Planning, future obligations, and household contributions are not yet one
  normalized contract.
- Some planning items may still represent obligations and need user review.

## Snapshot Validation Report

Implementation coverage: 67/100.

New Phase 2 Data Health check:

- Snapshot readiness for Robototina explanations.

The check verifies that core sources are readable and that Robototina has enough
structured metadata across cards, income, Plaid, ATH, planning, portfolio, and
ledger summaries to avoid guessing.

Known gaps:

- Snapshot does not yet expose a dedicated Data Health summary.
- Snapshot does not expose a formal TransferSummary.
- Debt/card completeness depends on manual metadata when provider data is
  incomplete.
- AI should wait until missing metadata is repaired or explicitly marked
  unknown.

## Updated Data Health Findings

Data Health now detects:

- Missing APR/promo APR through card strategy metadata.
- Missing card limits, available credit, balances, statement balance, and
  statement date.
- Missing card owner, due date, minimum payment, schedule and Plaid link.
- Missing income owner, destination, frequency, expected amount, and confidence.
- Expired/reconnect/error Plaid connections.
- Hidden, archived, inactive, excluded, or disconnected Plaid accounts.
- Plaid import availability.
- Duplicate accounts and duplicate transfer-like rows.
- Unmatched ATH rows and ambiguous transfer states.
- Planning rows missing owner/status/priority signals.
- Snapshot readiness for Robototina explanations.

## Phase 3 Health Center

Health Center now converts Data Health findings into operational sections:

- Overall Financial Health.
- Cards.
- Income.
- Plaid/accounts.
- Transfers.
- Planning.
- Snapshot.
- Robototina, Atlas and Production readiness gates.

Each finding is classified as:

- Automatically Repairable.
- Requires User Input.
- Requires External Sync.
- Informational Only.

No repair is applied automatically.

## Phase 4 Repair Center

Repair Center now converts Health Center findings into reviewable repair items:

- Cards.
- Transfers.
- Income.
- Plaid.
- Accounts.
- Planning.
- Portfolio.
- Snapshot.

Each repair item includes:

- title and description
- severity and confidence
- affected objects
- why the issue matters
- suggested action
- repair type
- workflow status

Status values are:

- Pending Review.
- Ready to Repair.
- User Confirmation Required.
- Waiting for External Sync.
- Completed.
- Ignored.

Current implementation is intentionally conservative:

- no automatic repairs
- no schema changes
- no destructive writes
- no persistent repair history table yet
- no AI or Atlas behavior

Technical false-positive cleanup:

- `payment_instances` and `future_obligations` are no longer treated as
  operational Health Center read-path blockers because they are legacy/support
  tables, not actionable user repair findings.
- Loan health now falls back to Portfolio Summary when raw `liabilities` is not
  available through the operational read path.

## Blockers Before Robototina AI

- Live authenticated Data Health must be run and documented.
- Missing card APR/due/minimum/statement metadata must be repaired or marked
  explicitly unknown.
- Income owner/frequency/date/amount confidence must be complete.
- TransferSummary contract is still needed.
- ATH unmatched/ambiguous rows require review.
- AI prompt/provenance/redaction contract is not implemented.

## Blockers Before Atlas

- Snapshot needs stable completeness guarantees.
- TransferSummary is missing.
- Debt/card metadata must be complete enough for scenario modeling.
- First-party tests are missing for engine contracts.
- Atlas scenario input/output contract is still documentation-only.
