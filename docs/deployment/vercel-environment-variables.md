# Vercel Environment Variables

Last updated: 2026-07-11

Do not commit secret values. This file inventories names only.

## Required Variables

| Name | Visibility | Environments | Required for | Notes |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Development, Preview, Production | Supabase browser/server clients | Public project URL. Safe to expose. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Development, Preview, Production | Legacy Supabase client fallback | Public anon/publishable key. Safe to expose if RLS is correct. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Preview, Production | Preferred Supabase SSR publishable key | Code falls back to anon key if absent. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret | Preview, Production | Admin Supabase routes | Never expose to client. Use only in route handlers/server code. |
| `PLAID_CLIENT_ID` | Server-only secret | Preview, Production | Plaid API | Use sandbox/development for Preview, production for Production. |
| `PLAID_SECRET` | Server-only secret | Preview, Production | Plaid API | Use environment-specific Plaid secret. |
| `PLAID_ENV` | Server-only config | Preview, Production | Plaid API base path | Expected values map to Plaid SDK environments. |
| `PLAID_TOKEN_ENCRYPTION_KEY` | Server-only secret | Preview, Production | Encrypt/decrypt Plaid access tokens | Must remain stable per database environment. Rotate carefully. |
| `GOOGLE_CLIENT_ID` | Server-only config | Preview, Production if Gmail enabled | Google OAuth/Gmail | OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | Server-only secret | Preview, Production if Gmail enabled | Google OAuth/Gmail | OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | Server-only config | Stable Preview, Production | Google OAuth callback | Must exactly match Google Cloud authorized redirect URI. |
| `MANSOR_TOKEN_ENCRYPTION_KEY` | Server-only secret | Preview, Production if Gmail enabled | Encrypt/decrypt stored Gmail refresh tokens | Recommended dedicated stable root secret. If absent, code temporarily derives a domain-separated key from `PLAID_TOKEN_ENCRYPTION_KEY`. Rotate only with a reviewed token reauthorization plan. |
| `GOOGLE_REFRESH_TOKEN` | Server-only secret | Optional compatibility fallback | Gmail import before household OAuth is completed | High sensitivity. New OAuth authorizations are encrypted in `gmail_evidence_sync_state`; remove this fallback after every enabled household has reauthorized successfully. |
| `MANSOR_ALLOWED_ORIGINS` | Server-only config | Preview, Production | Browser mutation CSRF boundary | Comma-separated exact HTTP(S) origins. No paths, wildcards, or empty entries. Preview URLs are not trusted automatically. |
| `MANSOR_INTERNAL_ADMIN_EMAILS` | Server-only config | Preview, optional Production | Internal tool allowlist | Comma-separated authenticated email addresses for `/dev`, `/lab`, `/api/dev`, and Gmail diagnostics. Missing or malformed configuration denies access. Required if enabling `/lab` in Production. |
| `MANSOR_ENABLE_LAB_IN_PRODUCTION` | Server-only config | Production only | Optional lab access | Defaults to disabled. Set to `true` only with a non-empty `MANSOR_INTERNAL_ADMIN_EMAILS` allowlist. |

## Local / Development-Only Variables

| Name | Status | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_PLAID_ENV` | Development-only or stale | Present in `.env.local`; no code reference found. |
| `MANSOR_USER_ID` | Development-only legacy | Present in `.env.local`; no current code reference found. |
| `NODE_ENV` | Platform-provided | Used to block some mutation routes in production. Do not set manually in Vercel. |

## Client Exposure Audit

Variables used in client-accessible modules:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

These are expected public Supabase values.

No server-only secrets were found in Client Components. Server-only secrets are
used in route handlers or server libraries.

Internal access variables are server-only. Do not prefix them with
`NEXT_PUBLIC_`.

## Security-sensitive list syntax

`MANSOR_ALLOWED_ORIGINS` uses comma-separated exact origins:

```text
https://preview.example.vercel.app,https://another-explicit-origin.example
```

Whitespace around entries is trimmed. Each entry must parse as an HTTP(S)
origin with no credentials, non-root path, query, fragment, or wildcard. The
optional root slash is normalized away; any other path is rejected. An empty or
malformed entry invalidates the entire allowlist. `VERCEL_URL` is
not trusted automatically. Temporarily authorize one Preview deployment by
adding only its exact origin to the Preview environment. Production must contain
only the official production origin.

`MANSOR_INTERNAL_ADMIN_EMAILS` uses comma-separated full email addresses:

```text
owner@example.com,admin@example.com
```

Whitespace is trimmed and matching is case-insensitive. Missing, empty, or
malformed configuration yields an empty allowlist and denies internal access.
Do not commit real addresses.

## Vercel Environment Setup

Configure variables separately for:

- Development: local only through `.env.local` or `vercel env pull`.
- Preview: sandbox/test integrations unless the preview is private and intended
  to hit live services.
- Production: production Supabase/Plaid/Google credentials only.

Vercel applies Preview variables to non-production branch deployments and
Production variables to Production deployments. Changes only apply to new
deployments.

## Provider Requirements

### Supabase

Set Supabase Auth Site URL to the final production app URL.

Add only required redirect URLs:

- `http://localhost:3000/**`
- one stable, explicit Preview URL when Preview OAuth is required
- `https://<production-domain>/**`

If using a custom stable preview domain, add it explicitly.

### Google OAuth

Google redirect URIs must exactly match registered values. Wildcards are not
allowed. Register:

- Local callback if used locally.
- Stable Preview callback if Google OAuth must work in Preview.
- Production callback.

The current route uses `GOOGLE_REDIRECT_URI` for both start and callback token
exchange. That value must match the Google Cloud Console entry exactly.

### Plaid

Preview should use Plaid sandbox/development credentials.

Production should use Plaid production credentials and an encryption key tied to
the production database. If OAuth institutions or webhooks are enabled, register:

- Allowed redirect URI in Plaid Dashboard.
- Webhook URL for Item updates.

The current link-token route does not set `redirect_uri` or webhook.
