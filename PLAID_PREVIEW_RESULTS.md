# Plaid Preview Results

Date: 2026-07-25
Status: Preview endpoint boundaries passed; real Link/repair flow not executed

## Verified in Preview

- The protected deployment is `READY`, uses Node.js 22, and is not Production.
- `/api/plaid/connections` returns `401` without a Mansor One session.
- `/api/plaid/update-link-token` returns:
  - `403` for an external Origin;
  - `403` when Origin is missing;
  - `403` for `Sec-Fetch-Site: cross-site`;
  - `403` for the unlisted generated Preview URL;
  - `401` for the exact allowed Origin without a session.
- These requests did not reach an authorized Plaid mutation and did not modify
  financial records.

## Automated implementation evidence

- Update Mode uses the authorized existing connection and its server-side
  access token; it does not create a new Item or exchange a public token.
- `REPAIR_SYNC_PENDING` is local to Mansor One.
- Credential repair and downstream synchronization retry are separate actions.
- A healthy `item/get` followed by downstream failure clears stale credential
  error state, records repair success separately, and does not claim full sync.
- Successful-sync timestamps require both account and transaction sync success.
- Repeated transaction sync uses `plaid_transaction_id` upsert identity and the
  persisted cursor.
- Archived connections remain excluded.
- Focused Plaid suite: 19/19 passed.
- Full repository suite before Preview preparation: 123/123 passed.

## Interactive evidence still required

No Plaid access token, Link token, public token, raw Plaid response, or
credential was retrieved or logged. Without an authenticated Mansor One browser
session and Plaid Link interaction, the following remain unverified in Preview:

- new Link creates exactly one Item;
- Banco Popular Update Mode and stale-error recovery;
- healthy `item/get` after bounded propagation retries;
- `REPAIR_SYNC_PENDING` presentation and retry without reopening Link;
- `last_sync_attempt_at`, `last_sync_at`, and `last_repair_success_at` changes
  across real requests;
- before/after transaction counts and `plaid_transaction_id` idempotency;
- cross-household and archived-connection rejection with authenticated actors;
- Plaid Link browser CSP behavior.

These are blocking checks. They must run only after confirming that the Preview
provider configuration and data target are appropriate for the intended test.
