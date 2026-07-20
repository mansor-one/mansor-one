# Health Center

Last updated: 2026-07-16

## Purpose

The Mansor One Health Center turns Data Health from a developer diagnostic into
an operational integrity surface for the household. It answers:

- Is the financial data complete enough to trust?
- What is missing or stale?
- Which issues can become reviewable repair candidates?
- Which issues require user confirmation?
- Which issues require external provider sync?
- Can Robototina, Atlas, and Production workflows trust the current data?

## Source of Truth

Health Center consumes the existing authenticated `getDataHealthReport()` output
and converts it into product-facing sections, readiness gates, and repair
backlog items. It does not query raw tables from React and does not change
Financial Engine calculations.

Runtime path:

```text
Authenticated server page
  -> getDataHealthReport()
  -> buildHealthCenterReport()
  -> React presentation
```

Phase 4 adds:

```text
HealthCenterReport
  -> buildRepairCenterReport()
  -> /repair-center
```

## Scoring Philosophy

Health Center keeps the Data Health score as the overall financial health score.
Section scores are derived from check severity:

- Critical issues have the largest penalty.
- Warnings reduce confidence but do not necessarily block use.
- Unknown checks mean the data could not be verified through the authenticated
  path and should not be treated as absence.
- Healthy checks add confidence but do not hide unresolved issues elsewhere.

Scores are operational readiness indicators, not a promise that all live data is
perfect.

## Repair Classification

Every finding is classified into one action type:

- Automatically Repairable: a reviewable candidate can be prepared, but no
  silent repair is applied.
- Requires User Input: household metadata or confirmation is needed.
- Requires External Sync: provider reconnection or sync is needed.
- Informational Only: no action is currently needed.

Examples:

- Missing APR: Requires User Input.
- Missing owner: Requires User Input.
- Plaid expired/reconnect state: Requires External Sync.
- Duplicate transfer or ledger duplicate candidate: Automatically Repairable.
- Healthy checks: Informational Only.

## Readiness Model

Health Center exposes three gates:

- Robototina Readiness: whether recommendations can be explained confidently.
- Atlas Readiness: whether future simulation can trust Snapshot inputs.
- Production Readiness: whether operational data and provider health are safe
  enough for production workflows.

Each gate includes:

- percentage score
- blockers
- next steps

## Repair Workflow

Health Center does not mutate data. Repair flow should remain explicit and
reviewable:

1. User opens a finding.
2. Mansor One explains the affected data and recommended action.
3. If a repair candidate exists, the user reviews it in the relevant workflow.
4. The user confirms or rejects the repair.
5. Health Center is run again to verify the result.

`/repair-center` is the operational workspace for this workflow. It groups
findings by financial area, exposes status and repair type, links to the
relevant product workflow, and keeps repair action explicit.

## Operational False Positives

Health Center should report actionable financial findings, not internal table
availability noise. Phase 4 removes generic access-path findings for legacy
support tables that are not direct repair surfaces:

- `payment_instances`
- `future_obligations`

Loan checks prefer Portfolio Summary when raw `liabilities` cannot be read
through the operational path. That keeps the finding focused on whether loan
data is visible through the official portfolio contract.

## Current Limitations

- Live authenticated results must be reviewed in the browser session.
- TransferSummary is not implemented yet.
- Persistent repair history requires a future approved data model.
- Some metadata repairs still depend on existing product editors rather than a
  dedicated inline repair form.
- Atlas remains blocked until Snapshot completeness and TransferSummary are
  stable.
- Robototina AI remains blocked until prompt/provenance/redaction contracts are
  implemented.
