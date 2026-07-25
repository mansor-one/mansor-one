# Security Route Matrix — Phase 1

Date: 2026-07-24

## Gmail and OAuth

| Method and route | Session | Authorization | CSRF/provider proof | Privileged access | Result |
|---|---|---|---|---|---|
| `GET /api/auth/google/start` | Required | Active household owner | Creates signed one-time state | None | 401/403/redirect |
| `GET /api/auth/google/callback` | Required | Active household owner | Signed, short-lived, user-bound state | Google token exchange only | 400/401/403/internal redirect |
| `POST /api/gmail/ath-import` | Required | Active household owner | Exact allowed Origin | Central admin client after auth | 401/403/5xx/counts |
| `GET /api/gmail/ath-import` | N/A | N/A | N/A | None | 405 |
| `GET /api/gmail/test` | Required | Internal allowlist + household owner | Read-only diagnostic | Gmail token after auth | 401/403/404/redacted output |
| `GET /api/gmail/ath-parse` | Required | Internal allowlist + household owner | Read-only diagnostic | Gmail token after auth | 401/403/404/parsed output |
| `GET /api/gmail/ath-test` | Required | Internal allowlist + household owner | Read-only diagnostic | None | 401/403/404/status |

## Financial and integration mutations

All routes below require a validated Supabase session, enforce row/entity
ownership through existing RLS and route queries, and now reject an invalid
Origin before parsing a mutation body.

| Family | Hardened routes |
|---|---|
| Cards | `POST /api/cards/confirm-payment`, `/create-manual-profile`, `/create-schedule`, `/update-profile` |
| Obligations | `POST/PATCH /api/obligations/confirm-paid`; `POST /api/obligations/reconciliation-candidate` |
| Review Queue | `POST /api/review-queue/confirm-duplicate`, `/confirm-import`, `/decide-transaction`, `/resolve-duplicate` |
| Ledger | `POST /api/ledger/category-conflict`, `/duplicate-resolution`, `/update-category` |
| Plaid | `POST /api/plaid/create-link-token`, `/update-link-token`, `/complete-update`, `/exchange-public-token`, `/import-transaction`, `/revoke-connection`, `/sync`, `/sync-accounts`, `/sync-imports` |
| Internal mutation diagnostics | `POST /api/dev/transaction-intelligence/generate-plaid-suggestions`, `/recategorize-plaid-suggestions` |

## Read-only, retired, and server-triggered routes

| Route | Boundary |
|---|---|
| Plaid GET status/accounts/transactions/connections | Direct validated session; RLS/user filters. |
| Obligation details GET | Direct validated session and ID constrained to caller lineage. |
| `POST /api/robototina/answer` | Validated session; read-only financial context. No Origin mutation gate because it does not write. |
| `/api/pablo/answer` GET/POST | Always 410; no data access. |
| `GET /api/plaid/sync/daily` | Exact `Bearer CRON_SECRET`; admin client created only after verification. |

## Sensitive pages with direct guards

All live financial pages remain protected by `proxy.ts`. `/imports` and `/lab`
now also call `requireUser()` directly. Review Queue routes already delegate to
`ReviewQueuePage`, which calls `requireUser()`.

Remaining static/proxy-only routes do not read financial data:
`/advisor-v2`, `/pablo-chat`, and static dev fixture pages. They remain tracked
for future cleanup, not as current data-exposure routes.
