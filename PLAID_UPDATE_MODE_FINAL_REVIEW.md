# Plaid Update Mode Final Review

Reviewed: 2026-07-25
Status: conditionally approved implementation; not deployed

## State ownership

`REPAIR_SYNC_PENDING` is a Mansor One local synchronization marker. It is stored
only as a prefix in `plaid_connections.last_sync_error` after Plaid has verified
the Item as healthy but an accounts or transactions sync has failed.

It is not a Plaid error code and is never supplied to `item/get`,
`link/token/create`, or any other Plaid SDK request. Plaid-originated errors
remain separate safe error codes.

## UI decision matrix

| Connection evidence | UI | Action |
| --- | --- | --- |
| `ITEM_LOGIN_REQUIRED`, `PENDING_DISCONNECT`, or `PENDING_EXPIRATION` | Requiere atención | **Reparar conexión** creates an Update Mode Link token for the existing Item and opens Plaid Link |
| local `REPAIR_SYNC_PENDING` | Repair succeeded; sync incomplete | **Reintentar sincronización** calls `complete-update` with `sync_retry`; it does not request a Link token or open Plaid Link |
| healthy Item and both sync stages successful | Active/healthy | Stale local errors are cleared and no repair action is shown |
| archived connection | Historical/archived | No repair or retry action; API authorization rejects it and updates require `archived_at IS NULL` |

The client checks `syncPending` before the Link-token request. Retry therefore
cannot reopen Plaid Link or ask for credentials.

## Timestamp semantics

- `last_sync_attempt_at`: set immediately before `item/get` and downstream work
  begins for every `complete-update` attempt, including `link_on_success` and
  `sync_retry`.
- `last_repair_success_at`: set only after bounded `item/get` verification
  returns an Item with `item.error = null`.
- `last_sync_at`: set only after both the targeted accounts sync and targeted
  transaction sync succeed.

These are connection-specific timestamps. General Plaid orchestration has its
own persisted run metadata; this review does not relabel those run timestamps.

## Healthy Item with downstream failure

When `item/get` is healthy but either downstream sync fails:

1. `last_repair_success_at` records verified repair success.
2. The stale `ITEM_LOGIN_REQUIRED` text is replaced by
   `REPAIR_SYNC_PENDING: <safe code>`.
3. `last_sync_at` remains unchanged.
4. The UI offers **Reintentar sincronización**, not credential repair.
5. A later successful retry clears `last_sync_error`, sets status `active`, and
   advances `last_sync_at`.

The API response distinguishes complete success, Plaid processing, credentials
still required, and other retryable sync failure without returning tokens or raw
Plaid payloads.

## Idempotency and lineage

Targeted retry filters the authorized active connection. Transaction persistence
uses `upsert(..., { onConflict: 'plaid_transaction_id' })` and a persisted Plaid
transactions cursor. Repeated retry actions update the same source transaction
instead of inserting a parallel copy. No Item creation or public-token exchange
exists in the repair-completion flow.

Account rows use `plaid_account_id` conflict identity. Archived connections are
excluded from selection and guarded again on connection metadata updates.

## Regression coverage

Automated coverage now explicitly verifies:

- stale `ITEM_LOGIN_REQUIRED` replacement after healthy `item/get`;
- repair success with downstream sync pending;
- retry without Link-token creation or Plaid Link reopening;
- successful retry clearing `REPAIR_SYNC_PENDING`;
- separate timestamp labels and updates;
- archived connections remaining outside repair/retry flows;
- source-ID transaction idempotency;
- migration additivity and absence of data/RLS changes.

No production observation is claimed until the migration and Preview deployment
receive separate approval.
