# Repair Center

Last updated: 2026-07-16

## Purpose

Repair Center is the operational workspace for resolving Health Center findings.
It turns diagnostics into guided repair work without introducing automatic
repairs, AI, Atlas behavior, schema changes, or destructive writes.

The intended product flow is:

```text
Health Center
  -> Finding
  -> Repair Center review
  -> Suggested action
  -> Explicit user approval in the linked workflow
  -> Repair or metadata update
  -> Health Center recalculation
```

## Source Path

Repair Center reuses Health Center output:

```text
Authenticated server page
  -> getDataHealthReport()
  -> buildHealthCenterReport()
  -> buildRepairCenterReport()
  -> React presentation
```

React does not query financial tables. Repair Center does not create a parallel
calculation path.

## Repair Item Contract

Each repair item includes:

- title
- description
- severity
- confidence
- affected objects
- why this matters
- suggested action
- repair type
- status
- workflow link

Status values:

- Pending Review
- Ready to Repair
- User Confirmation Required
- Waiting for External Sync
- Completed
- Ignored

Repair types:

- Reviewable repair
- Metadata update
- External sync
- Information only

## Approval Philosophy

Repair Center never repairs data silently. A finding may be classified as a
repair candidate, but the user must still review the evidence and approve the
change in the relevant workflow.

Examples:

- Missing APR opens the card/debt metadata workflow.
- Missing income destination opens Income Planning.
- Plaid connection issues open Plaid or Portfolio connection workflows.
- Transfer or duplicate candidates open History/review workflows.

## History Model

Phase 4 shows scan-derived completion from healthy checks in the latest Health
Center report. Persistent repair history is intentionally not implemented yet
because it requires an approved data model.

Future persistent history should record:

- timestamp
- user
- action
- object
- previous state where practical
- resulting health score

## False-Positive Policy

Repair Center should not expose internal implementation details as household
repair tasks. Phase 4 removes generic Health Center access noise for legacy
support tables that are not actionable repair surfaces:

- `payment_instances`
- `future_obligations`

Loan checks fall back to Portfolio Summary when raw `liabilities` is not
available through the operational path.

## Future Automation Opportunities

Automation may be considered only after:

- repair history is persisted
- explicit approval flows exist
- reversal strategy is documented
- tests prove that Health Center rescoring is deterministic
- user-facing copy clearly explains what changed

Until then, all repairs remain explicit and reviewable.
