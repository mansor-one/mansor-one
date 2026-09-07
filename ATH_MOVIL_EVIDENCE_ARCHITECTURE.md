# ATH Móvil Evidence Integration

## Audited starting point

- `ath_movil_emails` stored Gmail-derived rows and was already household scoped.
- `ath_movil_messages` linked some legacy evidence to Plaid or quick entries. It remains untouched.
- `ath_movil_matches` had only email, transaction, and confidence fields. It remains untouched for compatibility.
- `/api/gmail/ath-import` used Gmail metadata plus `snippet`, assigned suggested categories, and upserted by Gmail message ID.
- `/api/gmail/ath-parse` is an internal diagnostic parser and remains legacy.
- OAuth already requests only `gmail.readonly`; tokens remain in server-only environment variables.
- Review Queue derives financial candidates from `plaid_imports`; promotion to confirmed history writes `quick_entries` through its existing explicit decision flow.
- `/ath-movil` previously summed emails as spending. That parallel financial total has been removed.
- Financial totals do not read ATH evidence. `data-health` still reads `ath_movil_emails` only for diagnostics.

## Canonical boundaries

- Plaid remains the sole transaction source.
- `quick_entries` remains confirmed history.
- `ath_movil_emails` is normalized contextual evidence.
- `ath_movil_match_candidates` stores manual-review candidate relationships only.
- `gmail_evidence_sync_state` is server-only and stores the Gmail refresh token encrypted at rest. Browser clients receive neither ciphertext nor OAuth credentials.
- `gmail_evidence_sync_state` intentionally has RLS enabled with no client policy. Every read or write is performed by an authenticated server route through the centralized service-role client after household-manager authorization.
- Confirming or rejecting evidence never changes the Plaid import or confirmed ledger.

## Legacy compatibility

`ath_movil_matches`, `ath_movil_messages`, `matched_plaid_transaction_id`, and the internal Gmail diagnostic parser are retained. New imports and decisions use the canonical evidence tables. A later cleanup must first compare row counts and lineage, backfill only unambiguous relationships, and verify no active route reads the legacy tables.

## Safe retirement plan

1. Inventory non-null legacy links by household.
2. Produce a read-only mapping report to canonical emails and Plaid imports.
3. Move only uniquely linked evidence through a reviewed migration.
4. Keep unmatched and ambiguous legacy rows archived and queryable.
5. Remove application reads before revoking access.
6. Drop legacy tables only in a separately approved destructive migration.
