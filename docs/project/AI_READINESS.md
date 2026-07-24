# AI Readiness

Last updated: 2026-07-16

## Current score

AI Readiness: 62/100.

## What is ready

- Robototina is the official assistant route.
- Decision Engine v1 is the official recommendation source.
- `getRobototinaContext()` consumes Financial Engine Snapshot.
- Robototina Q&A exists as rules-based adapter.
- AI Playbook documents that AI must not read tables directly or invent
  balances.
- Data Health now checks card metadata, income owner/frequency, Plaid health,
  ATH/transfer ambiguity, planning identity and Snapshot readiness.
- Health Center exposes Robototina readiness from live Data Health checks.
- Repair Center turns Health Center findings into explicit review items before
  any metadata repair is applied.

## What is not ready

- Data completeness is not verified live through Data Health in this audit.
- TransferSummary is not implemented.
- Card/income missing metadata has detection coverage, but not live repair.
- Health Center and Repair Center findings must be reviewed, approved and
  rescored before enabling AI.
- Prompt/input contract for OpenAI is not implemented.
- No response provenance/audit table exists for AI answers.
- No user-visible limitation/citation model for AI-generated text.
- No rate limiting/cost controls for AI endpoints.
- No redaction policy for sensitive financial data sent to model.
- No tests for Robototina Q&A coverage.

## Robototina AI v1 required contract

```text
Financial Engine
  -> Snapshot
  -> Robototina Context Builder
  -> OpenAI
  -> Explained Answer
```

AI must not:

- query SQL directly
- calculate balances
- modify data
- invent unavailable facts
- override Decision Engine v1 priorities

AI may:

- explain official context
- ask for clarification
- summarize evidence
- state uncertainty
- suggest user-reviewed next actions

## Atlas readiness for AI

Atlas is not implemented. AI should not simulate scenarios until Atlas provides
deterministic simulated snapshots.

## MCP readiness for AI

MCP is not implemented. No MCP tool should exist until it can call official
Financial Engine/Atlas contracts and audited actions only.

## Recommended AI prerequisites

1. Run Health Center and Repair Center live, then repair approved P0/P1 data gaps.
2. Add Robototina context redaction/provenance contract.
3. Add prompt and response schema docs.
4. Add rate limits and audit logs.
5. Add Q&A fixtures.
6. Only then implement OpenAI route.
