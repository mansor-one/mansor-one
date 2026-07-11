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
| `GOOGLE_REFRESH_TOKEN` | Server-only secret | Preview/Production only if Gmail import enabled | Gmail import/test routes | High sensitivity; gives mailbox access for configured scopes. |

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

Add redirect URLs:

- `http://localhost:3000/**`
- `https://*-<team-or-account-slug>.vercel.app/**`
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
